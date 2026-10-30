"""
Email through Resend's HTTP API (block 44b): one POST, no SDK, no new dependency.

    RESEND_API_KEY   re_...; without it nothing is sent (logged), the caller is not told
    RESEND_FROM      the sender, e.g. "Pit Wall Engineer <access@pitwallengineer.com>"; the domain must be
                     verified in Resend (SPF and DKIM records, docs/PAYMENTS.md)

Tests swap the transport (set_transport); nothing here ever raises to the caller.
"""
from __future__ import annotations

import logging
import os

import httpx

logger = logging.getLogger(__name__)
API_URL = "https://api.resend.com/emails"
TIMEOUT_S = 10.0
_transport: httpx.AsyncBaseTransport | None = None


def set_transport(transport: httpx.AsyncBaseTransport | None) -> None:
    global _transport
    _transport = transport


def configured() -> bool:
    return bool(os.environ.get("RESEND_API_KEY", "").strip() and os.environ.get("RESEND_FROM", "").strip())


async def send(to: str, subject: str, text: str, html: str | None = None) -> bool:
    key = os.environ.get("RESEND_API_KEY", "").strip()
    sender = os.environ.get("RESEND_FROM", "").strip()
    if not key or not sender:
        logger.warning("[MAIL] not sent: RESEND_API_KEY or RESEND_FROM is not set")
        return False
    body = {"from": sender, "to": [to], "subject": subject, "text": text}
    if html:
        body["html"] = html
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S, transport=_transport) as client:
            r = await client.post(API_URL, json=body, headers={"Authorization": f"Bearer {key}"})
    except httpx.HTTPError as e:
        logger.warning("[MAIL] Resend did not answer: %s", type(e).__name__)
        return False
    if r.status_code >= 400:
        logger.warning("[MAIL] Resend refused the message: %s", r.status_code)
        return False
    return True
