"""
The PRO channel on Telegram (block 44b): Bot API over HTTP, no SDK.

    TELEGRAM_BOT_TOKEN        the bot (the same bot the publication Action uses is fine)
    TELEGRAM_PRO_CHAT_ID      the private channel, e.g. -1001234567890; the bot is an administrator there with
                              "Invite users via link" and "Ban users"
    TELEGRAM_WEBHOOK_SECRET   the secret_token given to setWebhook; Telegram sends it back in
                              X-Telegram-Bot-Api-Secret-Token on every update

Unset, everything here is a no-op that returns None: the subscription works without the channel. Tests swap the
transport (set_transport); nothing here raises to the caller.
"""
from __future__ import annotations

import hmac
import logging
import os
import time

import httpx

logger = logging.getLogger(__name__)
API = "https://api.telegram.org"
TIMEOUT_S = 10.0
INVITE_TTL_S = 24 * 3600
_transport: httpx.AsyncBaseTransport | None = None


def set_transport(transport: httpx.AsyncBaseTransport | None) -> None:
    global _transport
    _transport = transport


def _token() -> str:
    return os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()


def pro_chat_id() -> str:
    return os.environ.get("TELEGRAM_PRO_CHAT_ID", "").strip()


def configured() -> bool:
    return bool(_token() and pro_chat_id())


def secret_ok(header: str) -> bool:
    secret = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "").strip()
    return bool(secret) and hmac.compare_digest(secret, header or "")


async def call(method: str, payload: dict) -> dict | None:
    if not _token():
        return None
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S, transport=_transport) as client:
            r = await client.post(f"{API}/bot{_token()}/{method}", json=payload)
        body = r.json()
    except (httpx.HTTPError, ValueError) as e:
        logger.warning("[TELEGRAM] %s failed: %s", method, type(e).__name__)
        return None
    if not body.get("ok"):
        logger.warning("[TELEGRAM] %s refused: %s", method, body.get("description"))
        return None
    return body.get("result")


async def invite_link(subscription_id: str, now: int | None = None) -> str | None:
    """A single-use link to the PRO channel, valid 24 h, named after the subscription so a join can be traced back."""
    if not configured():
        return None
    result = await call("createChatInviteLink", {
        "chat_id": pro_chat_id(), "member_limit": 1,
        "expire_date": (now or int(time.time())) + INVITE_TTL_S, "name": subscription_id[:32],
    })
    return (result or {}).get("invite_link")


async def remove_member(user_id: int) -> bool:
    """Out of the channel without a permanent ban (ban, then unban), so a new subscription can join again."""
    if not configured():
        return False
    banned = await call("banChatMember", {"chat_id": pro_chat_id(), "user_id": user_id})
    await call("unbanChatMember", {"chat_id": pro_chat_id(), "user_id": user_id, "only_if_banned": True})
    return banned is not None
