"""
PRO by subscription (block 44, Stripe test mode only).

POST /billing/checkout   a Stripe Checkout Session for the monthly price; returns its url
GET  /billing/success    ?session_id=cs_...: verified with Stripe, answers the PRO token
POST /billing/renew      Bearer subscription token (expired is fine): Stripe says
                         whether it is still paid, and if so a fresh token comes back
POST /billing/portal     Bearer subscription token: a Customer Portal session to cancel
POST /billing/webhook    signature verified; deleted and payment_failed revoke at once (block 44b)
POST /billing/restore    {email}: always the same answer; a signed 15 minute link by email when Stripe has an
                         active subscription for it (block 44b)
POST /billing/restore/redeem  {token}: that link's token for a PRO token

Everything answers 503 PAYMENTS_DISABLED unless PAYMENTS_ENABLED is set, so with
the flag off the site keeps saying "Subscriptions are not open yet".

No database. Stripe is the record of who pays; the token carries the
subscription id and lasts until the end of the paid period plus GRACE_DAYS.
A lost token comes back by email (/billing/restore, through Resend).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import re
import time

from fastapi import APIRouter, BackgroundTasks, Query, Request
from pydantic import BaseModel

from app.api.access import _client_ip
from app.core import resend_api, stripe_api, telegram_api
from app.core.access import bearer_token, decode_token, encode_token, subscription_token
from app.core.billing_revocation import is_revoked, reinstate, revoke
from app.core.config import settings
from app.core.errors import AppError
from app.core.ratelimit import SlidingWindow

router = APIRouter(prefix="/billing", tags=["billing"])
logger = logging.getLogger(__name__)

# A failed renewal (card declined, Stripe retrying) should not lock a paying
# reader out mid race weekend: the token outlives the period by this much.
GRACE_DAYS = 3
CHECKOUT_LIMIT = 10
CHECKOUT_WINDOW_S = 3600
_checkout_limiter = SlidingWindow(CHECKOUT_LIMIT, CHECKOUT_WINDOW_S)
SESSION_ID = re.compile(r"^cs_(test|live)_[A-Za-z0-9]{1,200}$")
SUBSCRIPTION_ID = re.compile(r"^sub_[A-Za-z0-9]{1,200}$")
TERMS_TEXT = (
    "I agree to the Terms. Access starts now, and I understand that by starting it "
    "I lose the 14 day right of withdrawal for this month."
)


class CheckoutResponse(BaseModel):
    url: str


class TokenResponse(BaseModel):
    token: str
    expires_at: int
    expires_in: int
    free_seasons: list[int]
    # The PRO channel (block 44b): a single-use invite, only from /billing/success, null when the channel is not set up.
    telegram_invite: str | None = None


class PortalResponse(BaseModel):
    url: str


def _token_for(subscription: dict, issued_at: int) -> TokenResponse:
    end = stripe_api.period_end(subscription)
    if end is None:
        raise AppError("PAYMENTS_UPSTREAM", "The payment service gave no billing period.", status=502)
    token = subscription_token(subscription["id"], issued_at, end + GRACE_DAYS * 86400)
    return TokenResponse(
        token=encode_token(token),
        expires_at=token.expires_at,
        expires_in=token.expires_in,
        free_seasons=sorted(settings.free_seasons),
    )


def _subscription_from_bearer(request: Request) -> str:
    token = decode_token(bearer_token(request), allow_expired=True)
    if token is None or not token.subscription or not SUBSCRIPTION_ID.match(token.subscription):
        raise AppError("NOT_A_SUBSCRIPTION", "This access was not bought with a subscription.", status=409)
    return token.subscription


@router.post("/checkout", response_model=CheckoutResponse)
async def checkout(request: Request) -> CheckoutResponse:
    stripe_api.require_enabled()
    ip = _client_ip(request)
    wait = _checkout_limiter.retry_after(ip)
    if wait > 0:
        raise AppError("RATE_LIMITED", f"Too many attempts. Try again in {int(wait) + 1} s.", status=429,
                       details={"retry_after_seconds": int(wait) + 1, "scope": "ip"})
    _checkout_limiter.hit(ip)
    price = stripe_api.price_id()
    if not price:
        raise AppError("PAYMENTS_UNAVAILABLE", "Subscriptions are not open yet.", status=503)
    site = stripe_api.return_url()
    session = await stripe_api.call("POST", "/checkout/sessions", data={
        "mode": "subscription",
        "line_items[0][price]": price,
        "line_items[0][quantity]": "1",
        "success_url": f"{site}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url": f"{site}/plans",
        # The Terms box is required; the custom text carries the withdrawal waiver.
        "consent_collection[terms_of_service]": "required",
        "custom_text[terms_of_service_acceptance][message]": TERMS_TEXT,
        "allow_promotion_codes": "false",
    })
    logger.info("[BILLING] checkout session %s created", session.get("id"))
    return CheckoutResponse(url=session["url"])


@router.get("/success", response_model=TokenResponse)
async def success(session_id: str = Query(..., max_length=256)) -> TokenResponse:
    """
    Idempotent: the token is a function of the checkout session (issued at its
    creation, expiring with its subscription's period), so reloading the
    success page answers the same token, and nothing is written anywhere.
    """
    stripe_api.require_enabled()
    if not SESSION_ID.match(session_id):
        raise AppError("PAYMENTS_NOT_FOUND", "That checkout or subscription does not exist.", status=404)
    session = await stripe_api.call("GET", f"/checkout/sessions/{session_id}",
                                    params=[("expand[]", "subscription")])
    if session.get("mode") != "subscription" or session.get("status") != "complete" \
            or session.get("payment_status") not in {"paid", "no_payment_required"}:
        raise AppError("PAYMENT_INCOMPLETE", "This checkout has not been paid.", status=402)
    sub = session.get("subscription")
    if not isinstance(sub, dict):
        raise AppError("PAYMENTS_UPSTREAM", "The payment service gave no subscription.", status=502)
    if not stripe_api.is_active(sub):
        raise AppError("SUBSCRIPTION_INACTIVE", "This subscription is not active.", status=402)
    if is_revoked(str(sub.get("id"))):
        raise AppError("SUBSCRIPTION_REVOKED", "Access for this subscription has been withdrawn.", status=403)
    logger.info("[BILLING] token for subscription %s (checkout %s)", sub.get("id"), session_id)
    out = _token_for(sub, int(session.get("created") or time.time()))
    # A new single-use link on every call: reloading the page makes another one, and the unused ones expire in 24 h.
    out.telegram_invite = await telegram_api.invite_link(str(sub.get("id")))
    return out


@router.post("/renew", response_model=TokenResponse)
async def renew(request: Request) -> TokenResponse:
    stripe_api.require_enabled()
    sub_id = _subscription_from_bearer(request)
    sub = await stripe_api.call("GET", f"/subscriptions/{sub_id}")
    if not stripe_api.is_active(sub):
        logger.info("[BILLING] renewal refused: subscription %s is %s", sub_id, sub.get("status"))
        raise AppError("SUBSCRIPTION_INACTIVE", "This subscription is no longer active.", status=402)
    return _token_for(sub, int(time.time()))


@router.post("/portal", response_model=PortalResponse)
async def portal(request: Request) -> PortalResponse:
    stripe_api.require_enabled()
    sub_id = _subscription_from_bearer(request)
    sub = await stripe_api.call("GET", f"/subscriptions/{sub_id}")
    customer = sub.get("customer")
    if not isinstance(customer, str):
        raise AppError("PAYMENTS_UPSTREAM", "The payment service gave no customer.", status=502)
    session = await stripe_api.call("POST", "/billing_portal/sessions", data={
        "customer": customer,
        "return_url": f"{stripe_api.return_url()}/settings",
    })
    return PortalResponse(url=session["url"])


def _subscription_of(event_type: str, obj: dict) -> str | None:
    """The subscription an event is about. Invoices carry it at the top (older API versions) or under
    parent.subscription_details (2025 onwards)."""
    if event_type.startswith("customer.subscription."):
        sid = obj.get("id")
    else:
        sid = obj.get("subscription") or (((obj.get("parent") or {}).get("subscription_details") or {}).get("subscription"))
    if isinstance(sid, dict):
        sid = sid.get("id")
    return sid if isinstance(sid, str) and SUBSCRIPTION_ID.match(sid) else None


@router.post("/webhook")
async def webhook(request: Request) -> dict:
    """
    Signature first (STRIPE_WEBHOOK_SECRET, 5 minute tolerance), then the events that act (block 44b):

      customer.subscription.deleted   the subscription has ended: revoked now (runtime list), and the
                                      Telegram member, if known, removed from the PRO channel
      invoice.payment_failed          revoked now; Stripe keeps retrying the card
      customer.subscription.updated   back to active after a failed payment: that revocation is taken back
      anything else                   logged

    Idempotent (Stripe retries events): revoking twice or reinstating twice changes nothing.
    """
    stripe_api.require_enabled()
    payload = await request.body()
    if not stripe_api.verify_webhook(payload, request.headers.get("stripe-signature", "")):
        raise AppError("BAD_SIGNATURE", "Webhook signature did not verify.", status=400)
    try:
        event = json.loads(payload)
    except ValueError:
        raise AppError("BAD_PAYLOAD", "Webhook body is not JSON.", status=400)
    etype = str(event.get("type") or "")
    obj = (event.get("data") or {}).get("object") or {}
    logger.info("[BILLING] webhook %s %s object=%s status=%s", etype, event.get("id"), obj.get("id"), obj.get("status"))
    sub_id = _subscription_of(etype, obj)
    action = "logged"
    if sub_id and etype == "customer.subscription.deleted":
        revoke(sub_id, "deleted")
        action = "revoked"
        await _on_subscription_ended(obj)
    elif sub_id and etype == "invoice.payment_failed":
        revoke(sub_id, "payment_failed")
        action = "revoked"
    elif sub_id and etype == "customer.subscription.updated" and stripe_api.is_active(obj):
        if reinstate(sub_id, only_reason="payment_failed"):
            action = "reinstated"
    if action != "logged":
        logger.warning("[BILLING] %s %s after %s; to keep it cut off across restarts add it to PAYMENTS_REVOKED_SUBS",
                       action, sub_id, etype)
    return {"received": True, "action": action}


async def _on_subscription_ended(subscription: dict) -> None:
    """Out of the PRO channel, when the join was traced to this subscription (metadata.telegram_user_id)."""
    raw = ((subscription.get("metadata") or {}).get("telegram_user_id") or "").strip()
    if not raw.isdigit():
        logger.info("[BILLING] %s ended with no Telegram member on record", subscription.get("id"))
        return
    ok = await telegram_api.remove_member(int(raw))
    logger.info("[BILLING] Telegram member of %s %s", subscription.get("id"), "removed" if ok else "not removed")


@router.post("/telegram/webhook")
async def telegram_webhook(request: Request) -> dict:
    """
    Telegram's updates for the bot (setWebhook with allowed_updates ["chat_member"] and secret_token). When someone
    joins the PRO channel through an invite named after a subscription, that subscription's Stripe metadata gets
    their Telegram user id, so a cancellation can remove them later: Stripe stays the only record. Always 200 once
    the secret matches, so Telegram does not retry what is not ours.
    """
    if not telegram_api.secret_ok(request.headers.get("x-telegram-bot-api-secret-token", "")):
        raise AppError("BAD_SIGNATURE", "Unknown sender.", status=401)
    try:
        update = json.loads(await request.body())
    except ValueError:
        return {"ok": True}
    cm = update.get("chat_member") or {}
    chat = str((cm.get("chat") or {}).get("id", ""))
    status = (cm.get("new_chat_member") or {}).get("status")
    user = (cm.get("new_chat_member") or {}).get("user") or {}
    sub_id = ((cm.get("invite_link") or {}).get("name") or "").strip()
    if chat != telegram_api.pro_chat_id() or status != "member" or not SUBSCRIPTION_ID.match(sub_id) \
            or not isinstance(user.get("id"), int):
        return {"ok": True}
    if not stripe_api.payments_enabled():
        return {"ok": True}
    await stripe_api.call("POST", f"/subscriptions/{sub_id}", data={"metadata[telegram_user_id]": str(user["id"])})
    logger.info("[BILLING] Telegram member recorded on %s", sub_id)
    return {"ok": True}


# ── restore access by email (block 44b) ──────────────────────────────────────

RESTORE_TTL_S = 15 * 60
RESTORE_PREFIX = "rs1"
RESTORE_IP_LIMIT, RESTORE_EMAIL_LIMIT, RESTORE_WINDOW_S = 5, 3, 3600
_restore_ip_limiter = SlidingWindow(RESTORE_IP_LIMIT, RESTORE_WINDOW_S)
_restore_email_limiter = SlidingWindow(RESTORE_EMAIL_LIMIT, RESTORE_WINDOW_S)
EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,253}\.[^@\s]{2,}$")
RESTORE_ANSWER = "If an active subscription uses that email, a link to restore access is on its way. It works for 15 minutes."


class RestoreRequest(BaseModel):
    email: str


class RestoreResponse(BaseModel):
    sent: bool = True
    message: str = RESTORE_ANSWER


class RedeemRestoreRequest(BaseModel):
    token: str


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _restore_secret() -> bytes:
    secret = settings.pro_token_secret.get_secret_value()
    if not secret:
        raise AppError("PAYMENTS_UNAVAILABLE", "Subscriptions are not open yet.", status=503)
    # Domain-separated from the PRO tokens signed with the same secret.
    return hashlib.sha256(b"restore-link:" + secret.encode()).digest()


def restore_link_token(subscription_id: str, now: int | None = None) -> str:
    payload = _b64(json.dumps({"sub": subscription_id, "exp": (now or int(time.time())) + RESTORE_TTL_S},
                              separators=(",", ":")).encode())
    sig = _b64(hmac.new(_restore_secret(), f"{RESTORE_PREFIX}.{payload}".encode(), hashlib.sha256).digest())
    return f"{RESTORE_PREFIX}.{payload}.{sig}"


def read_restore_token(raw: str, now: int | None = None) -> str:
    """The subscription id in a valid, unexpired link token, or an error."""
    parts = raw.split(".")
    if len(parts) != 3 or parts[0] != RESTORE_PREFIX:
        raise AppError("RESTORE_LINK_INVALID", "This link is not valid. Ask for a new one.", status=400)
    expected = _b64(hmac.new(_restore_secret(), f"{parts[0]}.{parts[1]}".encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(expected, parts[2]):
        raise AppError("RESTORE_LINK_INVALID", "This link is not valid. Ask for a new one.", status=400)
    try:
        claims = json.loads(_unb64(parts[1]))
    except ValueError:
        raise AppError("RESTORE_LINK_INVALID", "This link is not valid. Ask for a new one.", status=400)
    if int(claims.get("exp", 0)) < (now or int(time.time())):
        raise AppError("RESTORE_LINK_EXPIRED", "This link has expired. Ask for a new one.", status=410)
    sub = str(claims.get("sub", ""))
    if not SUBSCRIPTION_ID.match(sub):
        raise AppError("RESTORE_LINK_INVALID", "This link is not valid. Ask for a new one.", status=400)
    return sub


async def _send_restore_link(email: str) -> None:
    """After the answer has gone: Stripe, then Resend. Every failure is logged and swallowed."""
    try:
        customers = await stripe_api.call("GET", "/customers", params=[("email", email), ("limit", "10")])
        for customer in customers.get("data") or []:
            subs = await stripe_api.call("GET", "/subscriptions",
                                         params=[("customer", str(customer.get("id"))), ("status", "all"), ("limit", "10")])
            for sub in subs.get("data") or []:
                sid = str(sub.get("id", ""))
                if stripe_api.is_active(sub) and SUBSCRIPTION_ID.match(sid) and not is_revoked(sid):
                    link = f"{stripe_api.return_url()}/billing/restore?token={restore_link_token(sid)}"
                    text = ("Here is your link to restore Pit Wall Engineer PRO on this browser:\n\n"
                            f"{link}\n\nIt works for 15 minutes. If you did not ask for it, ignore this email.")
                    ok = await resend_api.send(email, "Restore your Pit Wall Engineer PRO access", text)
                    logger.info("[BILLING] restore link for %s: %s", sid, "sent" if ok else "not sent")
                    return
        logger.info("[BILLING] restore asked for an email with no active subscription")
    except AppError as e:
        logger.warning("[BILLING] restore lookup failed: %s", e.code)


@router.post("/restore", response_model=RestoreResponse)
async def restore(body: RestoreRequest, request: Request, background: BackgroundTasks) -> RestoreResponse:
    """
    Always the same answer, sent before anything is looked up, so neither the text nor the time it takes says
    whether the email belongs to a subscriber. Over the limits (per IP, per email) nothing is looked up.
    """
    stripe_api.require_enabled()
    email = body.email.strip().lower()[:320]
    ip = _client_ip(request)
    email_key = hashlib.sha256(email.encode()).hexdigest()
    allowed = (EMAIL.match(email) is not None
               and _restore_ip_limiter.retry_after(ip) <= 0
               and _restore_email_limiter.retry_after(email_key) <= 0)
    _restore_ip_limiter.hit(ip)
    if EMAIL.match(email):
        _restore_email_limiter.hit(email_key)
    if allowed:
        background.add_task(_send_restore_link, email)
    return RestoreResponse()


@router.post("/restore/redeem", response_model=TokenResponse)
async def redeem_restore(body: RedeemRestoreRequest) -> TokenResponse:
    stripe_api.require_enabled()
    sub_id = read_restore_token(body.token.strip())
    sub = await stripe_api.call("GET", f"/subscriptions/{sub_id}")
    if not stripe_api.is_active(sub):
        raise AppError("SUBSCRIPTION_INACTIVE", "This subscription is no longer active.", status=402)
    if is_revoked(sub_id):
        raise AppError("SUBSCRIPTION_REVOKED", "Access for this subscription has been withdrawn.", status=403)
    logger.info("[BILLING] access restored for %s", sub_id)
    return _token_for(sub, int(time.time()))
