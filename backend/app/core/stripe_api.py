"""
The few Stripe calls the PRO subscription needs, over plain HTTPS.

No stripe SDK: five endpoints do not justify a dependency, and httpx is already
here. Tests swap the transport (set_transport) so no test ever reaches Stripe.

Configuration is read from the environment when a call is made, not from
app.core.config: the payment variables live with the code that uses them.

    PAYMENTS_ENABLED        "1"/"true" turns the /billing routes on. Off by default.
    STRIPE_SECRET_KEY       sk_test_... only; a live key is refused (see TEST_MODE_ONLY).
    STRIPE_PRICE_ID         the recurring price (2.99 EUR a month), price_...
    STRIPE_WEBHOOK_SECRET   whsec_... for /billing/webhook
    PAYMENTS_RETURN_URL     the site Stripe sends the visitor back to.

Stripe is the only record of who pays. There is no database: a subscription
token carries the subscription id, and anything that needs to know whether it
is still paid asks Stripe.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import time
from typing import Any

import httpx

from app.core.errors import AppError

logger = logging.getLogger(__name__)

API_BASE = "https://api.stripe.com/v1"
TIMEOUT_S = 15.0
# Stripe's own default tolerance for a webhook timestamp.
WEBHOOK_TOLERANCE_S = 300
# Block 44 is test mode only. Taking real money is a decision for the owner,
# made by changing this line, not by pasting the wrong key into Render.
TEST_MODE_ONLY = True
ACTIVE_STATUSES = {"active", "trialing"}

_transport: httpx.AsyncBaseTransport | None = None


def set_transport(transport: httpx.AsyncBaseTransport | None) -> None:
    """Tests only: route every Stripe call through this transport."""
    global _transport
    _transport = transport


def payments_enabled() -> bool:
    return os.environ.get("PAYMENTS_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}


def return_url() -> str:
    return os.environ.get("PAYMENTS_RETURN_URL", "https://pitwallengineer.com").rstrip("/")


def price_id() -> str:
    return os.environ.get("STRIPE_PRICE_ID", "").strip()


def _secret_key() -> str:
    key = os.environ.get("STRIPE_SECRET_KEY", "").strip()
    if not key:
        raise AppError("PAYMENTS_UNAVAILABLE", "Subscriptions are not open yet.", status=503)
    if TEST_MODE_ONLY and not key.startswith(("sk_test_", "rk_test_")):
        logger.error("[BILLING] refused a Stripe key that is not a test key")
        raise AppError("PAYMENTS_UNAVAILABLE", "Subscriptions are not open yet.", status=503)
    return key


def require_enabled() -> None:
    if not payments_enabled():
        raise AppError("PAYMENTS_DISABLED", "Subscriptions are not open yet.", status=503)


async def call(method: str, path: str, data: dict[str, Any] | None = None,
               params: list[tuple[str, str]] | None = None) -> dict:
    """One Stripe request. Any Stripe or network failure is a 502 to the caller."""
    key = _secret_key()
    try:
        async with httpx.AsyncClient(base_url=API_BASE, timeout=TIMEOUT_S, transport=_transport) as client:
            r = await client.request(method, path, data=data, params=params,
                                     headers={"Authorization": f"Bearer {key}"})
    except httpx.HTTPError as e:
        logger.warning("[BILLING] Stripe %s %s failed: %s", method, path, type(e).__name__)
        raise AppError("PAYMENTS_UPSTREAM", "The payment service did not answer. Try again.", status=502)
    if r.status_code == 404:
        raise AppError("PAYMENTS_NOT_FOUND", "That checkout or subscription does not exist.", status=404)
    if r.status_code >= 400:
        kind = (r.json().get("error") or {}).get("type", "") if r.headers.get("content-type", "").startswith("application/json") else ""
        logger.warning("[BILLING] Stripe %s %s answered %s %s", method, path, r.status_code, kind)
        raise AppError("PAYMENTS_UPSTREAM", "The payment service refused the request.", status=502)
    return r.json()


def period_end(subscription: dict) -> int | None:
    """
    End of the paid period. Older Stripe API versions put it on the
    subscription, newer ones (2025-03-31 onwards) on each subscription item.
    """
    end = subscription.get("current_period_end")
    if end is None:
        items = ((subscription.get("items") or {}).get("data") or [])
        ends = [i.get("current_period_end") for i in items if i.get("current_period_end")]
        end = max(ends) if ends else None
    return int(end) if end is not None else None


def is_active(subscription: dict) -> bool:
    return subscription.get("status") in ACTIVE_STATUSES


def verify_webhook(payload: bytes, header: str, now: float | None = None) -> bool:
    """
    Stripe-Signature: t=<unix>,v1=<hex hmac>[,v1=...]. The signed text is
    "<t>.<raw body>" under STRIPE_WEBHOOK_SECRET; stale timestamps are refused
    so a captured request cannot be replayed later.
    """
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "").strip()
    if not secret or not header:
        return False
    parts: dict[str, list[str]] = {}
    for item in header.split(","):
        k, _, v = item.strip().partition("=")
        parts.setdefault(k, []).append(v)
    try:
        t = int(parts.get("t", [""])[0])
    except ValueError:
        return False
    if abs((now if now is not None else time.time()) - t) > WEBHOOK_TOLERANCE_S:
        return False
    expected = hmac.new(secret.encode(), f"{t}.".encode() + payload, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, sig) for sig in parts.get("v1", []))
