"""
PRO by subscription (block 44, Stripe test mode only).

POST /billing/checkout   a Stripe Checkout Session for the monthly price; returns its url
GET  /billing/success    ?session_id=cs_...: verified with Stripe, answers the PRO token
POST /billing/renew      Bearer subscription token (expired is fine): Stripe says
                         whether it is still paid, and if so a fresh token comes back
POST /billing/portal     Bearer subscription token: a Customer Portal session to cancel
POST /billing/webhook    signature verified, the event logged, nothing stored

Everything answers 503 PAYMENTS_DISABLED unless PAYMENTS_ENABLED is set, so with
the flag off the site keeps saying "Subscriptions are not open yet".

No database. Stripe is the record of who pays; the token carries the
subscription id and lasts until the end of the paid period plus GRACE_DAYS.
/billing/restore (lost token, by payment email) waits for the owner's choice of
email provider.
"""
from __future__ import annotations

import json
import logging
import re
import time

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from app.api.access import _client_ip
from app.core import stripe_api
from app.core.access import bearer_token, decode_token, encode_token, subscription_token
from app.core.billing_revocation import is_revoked
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
    return _token_for(sub, int(session.get("created") or time.time()))


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


@router.post("/webhook")
async def webhook(request: Request) -> dict:
    """Logged, not stored: there is no state here for an event to change."""
    stripe_api.require_enabled()
    payload = await request.body()
    if not stripe_api.verify_webhook(payload, request.headers.get("stripe-signature", "")):
        raise AppError("BAD_SIGNATURE", "Webhook signature did not verify.", status=400)
    try:
        event = json.loads(payload)
    except ValueError:
        raise AppError("BAD_PAYLOAD", "Webhook body is not JSON.", status=400)
    obj = (event.get("data") or {}).get("object") or {}
    logger.info("[BILLING] webhook %s %s object=%s status=%s", event.get("type"), event.get("id"),
                obj.get("id"), obj.get("status"))
    return {"received": True}
