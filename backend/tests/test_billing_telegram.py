"""
The PRO channel on Telegram (block 44b): a single-use invite on /billing/success, the join traced to the subscription
in Stripe's metadata, and the member removed when the subscription ends. Telegram and Stripe are simulated.
"""
from __future__ import annotations

import json
import time

import httpx
import pytest

from app.core import billing_revocation, stripe_api, telegram_api
from tests.test_billing import _signed, client, stripe  # noqa: F401  (the fixture)

CHAT = "-1001234567890"


class Bot:
    def __init__(self, fail: bool = False):
        self.calls: list[tuple[str, dict]] = []
        self.fail = fail

    def handler(self, request: httpx.Request) -> httpx.Response:
        assert request.url.host == "api.telegram.org" and "/bot123:ABC/" in request.url.path
        method = request.url.path.rsplit("/", 1)[1]
        body = json.loads(request.content)
        self.calls.append((method, body))
        if self.fail:
            return httpx.Response(400, json={"ok": False, "description": "Bad Request: not enough rights"})
        if method == "createChatInviteLink":
            return httpx.Response(200, json={"ok": True, "result": {"invite_link": "https://t.me/+single_use"}})
        return httpx.Response(200, json={"ok": True, "result": True})


@pytest.fixture
def bot(stripe, monkeypatch):
    base = stripe.handler

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "POST" and request.url.path == "/v1/subscriptions/sub_ABC123":
            form = dict(httpx.QueryParams(request.content.decode()))
            stripe.calls.append(("POST", request.url.path, form))
            return httpx.Response(200, json={**stripe.sub, "metadata": {"telegram_user_id": form.get("metadata[telegram_user_id]")}})
        return base(request)

    stripe_api.set_transport(httpx.MockTransport(handler))
    b = Bot()
    telegram_api.set_transport(httpx.MockTransport(b.handler))
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "123:ABC")
    monkeypatch.setenv("TELEGRAM_PRO_CHAT_ID", CHAT)
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", "tg-secret")
    billing_revocation._reset_runtime_for_tests()
    yield b
    telegram_api.set_transport(None)


def test_success_carries_a_single_use_invite_valid_24_hours(bot):
    r = client.get("/billing/success", params={"session_id": "cs_test_abc"})
    assert r.status_code == 200 and r.json()["telegram_invite"] == "https://t.me/+single_use"
    method, body = bot.calls[0]
    assert method == "createChatInviteLink"
    assert body["chat_id"] == CHAT and body["member_limit"] == 1 and body["name"] == "sub_ABC123"
    assert abs(body["expire_date"] - (time.time() + 24 * 3600)) < 60


def test_no_channel_configured_no_invite_and_the_token_still_comes(bot, monkeypatch):
    monkeypatch.setenv("TELEGRAM_PRO_CHAT_ID", "")
    r = client.get("/billing/success", params={"session_id": "cs_test_abc"})
    assert r.status_code == 200 and r.json()["telegram_invite"] is None and r.json()["token"]
    assert bot.calls == []


def test_a_telegram_failure_never_costs_the_token(bot):
    bot.fail = True
    r = client.get("/billing/success", params={"session_id": "cs_test_abc"})
    assert r.status_code == 200 and r.json()["token"] and r.json()["telegram_invite"] is None


def update(chat: str = CHAT, status: str = "member", name: str | None = "sub_ABC123", user: int = 4242) -> dict:
    return {"update_id": 1, "chat_member": {
        "chat": {"id": int(chat)}, "from": {"id": user},
        "new_chat_member": {"status": status, "user": {"id": user}},
        **({"invite_link": {"invite_link": "https://t.me/+x", "name": name}} if name else {}),
    }}


def tg(body: dict, secret: str = "tg-secret"):
    return client.post("/billing/telegram/webhook", json=body, headers={"X-Telegram-Bot-Api-Secret-Token": secret})


def test_a_join_through_the_invite_is_recorded_on_the_subscription(bot, stripe):
    assert tg(update()).status_code == 200
    assert ("POST", "/v1/subscriptions/sub_ABC123", {"metadata[telegram_user_id]": "4242"}) in stripe.calls


@pytest.mark.parametrize("why, body", [
    ("another chat", update(chat="-1009999")),
    ("a member leaving", update(status="left")),
    ("joined by another link", update(name=None)),
    ("a link not named after a subscription", update(name="friends")),
])
def test_other_updates_record_nothing(bot, stripe, why, body):
    assert tg(body).status_code == 200, why
    assert not [c for c in stripe.calls if c[0] == "POST"], why


def test_the_telegram_webhook_needs_its_secret(bot, stripe):
    assert tg(update(), secret="wrong").status_code == 401
    assert tg(update(), secret="").status_code == 401
    assert not [c for c in stripe.calls if c[0] == "POST"]


def deleted(metadata: dict) -> tuple[bytes, str]:
    body = json.dumps({"id": "evt_d", "type": "customer.subscription.deleted",
                       "data": {"object": {"id": "sub_ABC123", "status": "canceled", "metadata": metadata}}}).encode()
    return body, _signed(body, int(time.time()))


def test_when_the_subscription_ends_the_member_leaves_the_channel(bot):
    body, sig = deleted({"telegram_user_id": "4242"})
    assert client.post("/billing/webhook", content=body, headers={"Stripe-Signature": sig}).json()["action"] == "revoked"
    assert [m for m, _ in bot.calls] == ["banChatMember", "unbanChatMember"]
    assert bot.calls[0][1] == {"chat_id": CHAT, "user_id": 4242}
    assert bot.calls[1][1]["only_if_banned"] is True                  # out, not banned for good


def test_a_member_never_traced_cannot_be_removed(bot):
    """The documented limit: someone who joined before the trace existed, or by another link, stays."""
    body, sig = deleted({})
    assert client.post("/billing/webhook", content=body, headers={"Stripe-Signature": sig}).json()["action"] == "revoked"
    assert bot.calls == []
