"""
/billing on a simulated Stripe (block 44). No test reaches Stripe: every call
goes through an httpx.MockTransport, and an unexpected path fails the test.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.api import billing
from app.core import stripe_api
from app.core.access import decode_token, encode_token, known_code_ids, mint_token
from app.core.config import settings
from app.main import app

SECRET = "test-token-secret"
PERIOD_END = int(time.time()) + 20 * 86400
CREATED = int(time.time()) - 60


class FakeStripe:
    def __init__(self):
        self.calls: list[tuple[str, str, dict]] = []
        self.sub = {"id": "sub_ABC123", "status": "active", "customer": "cus_XYZ",
                    "items": {"data": [{"current_period_end": PERIOD_END}]}}
        self.session = {"id": "cs_test_abc", "mode": "subscription", "status": "complete",
                        "payment_status": "paid", "created": CREATED}

    def handler(self, request: httpx.Request) -> httpx.Response:
        assert request.url.host == "api.stripe.com"
        assert request.headers["authorization"] == "Bearer sk_test_fake"
        form = dict(httpx.QueryParams(request.content.decode())) if request.content else {}
        self.calls.append((request.method, request.url.path, form))
        path = request.url.path
        if request.method == "POST" and path == "/v1/checkout/sessions":
            return httpx.Response(200, json={"id": "cs_test_new", "url": "https://checkout.stripe.com/c/pay/cs_test_new"})
        if request.method == "GET" and path == "/v1/checkout/sessions/cs_test_abc":
            return httpx.Response(200, json={**self.session, "subscription": self.sub})
        if request.method == "GET" and path.startswith("/v1/checkout/sessions/"):
            return httpx.Response(404, json={"error": {"type": "invalid_request_error"}})
        if request.method == "GET" and path == "/v1/subscriptions/sub_ABC123":
            return httpx.Response(200, json=self.sub)
        if request.method == "POST" and path == "/v1/billing_portal/sessions":
            return httpx.Response(200, json={"url": "https://billing.stripe.com/p/session/x"})
        raise AssertionError(f"unexpected Stripe call {request.method} {path}")


@pytest.fixture
def stripe(monkeypatch):
    fake = FakeStripe()
    stripe_api.set_transport(httpx.MockTransport(fake.handler))
    monkeypatch.setenv("PAYMENTS_ENABLED", "1")
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_fake")
    monkeypatch.setenv("STRIPE_PRICE_ID", "price_test_1")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setenv("PAYMENTS_RETURN_URL", "https://example.test")
    monkeypatch.setattr(settings, "pro_token_secret", SecretStr(SECRET))
    monkeypatch.setattr(settings, "pro_access_codes", ["owner-code-1"])
    monkeypatch.setattr(settings, "free_seasons", [2023, 2024])
    billing._checkout_limiter._hits.clear()
    from app.core import billing_revocation
    billing_revocation._reset_runtime_for_tests()          # the webhook now revokes (block 44b)
    yield fake
    stripe_api.set_transport(None)
    billing_revocation._reset_runtime_for_tests()


client = TestClient(app)


def test_everything_is_off_by_default(monkeypatch):
    monkeypatch.delenv("PAYMENTS_ENABLED", raising=False)
    for method, path in [("POST", "/billing/checkout"), ("GET", "/billing/success?session_id=cs_test_abc"),
                         ("POST", "/billing/renew"), ("POST", "/billing/portal"), ("POST", "/billing/webhook")]:
        r = client.request(method, path)
        assert r.status_code == 503, path
        assert r.json()["error"] == {"code": "PAYMENTS_DISABLED", "message": "Subscriptions are not open yet.", "details": None}


def test_a_live_key_is_refused(stripe, monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_live_real")
    r = client.post("/billing/checkout")
    assert r.status_code == 503 and r.json()["error"]["code"] == "PAYMENTS_UNAVAILABLE"
    assert stripe.calls == []


def test_checkout_asks_for_the_subscription_with_terms(stripe):
    r = client.post("/billing/checkout")
    assert r.status_code == 200
    assert r.json() == {"url": "https://checkout.stripe.com/c/pay/cs_test_new"}
    (_, _, form), = stripe.calls
    assert form["mode"] == "subscription"
    assert form["line_items[0][price]"] == "price_test_1"
    assert form["consent_collection[terms_of_service]"] == "required"
    assert "withdrawal" in form["custom_text[terms_of_service_acceptance][message]"]
    assert form["success_url"] == "https://example.test/billing/success?session_id={CHECKOUT_SESSION_ID}"


def test_success_issues_a_pro_token_and_is_idempotent(stripe):
    a = client.get("/billing/success", params={"session_id": "cs_test_abc"})
    b = client.get("/billing/success", params={"session_id": "cs_test_abc"})
    assert a.status_code == 200 and a.json()["token"] == b.json()["token"]
    assert a.json()["expires_at"] == PERIOD_END + billing.GRACE_DAYS * 86400
    token = decode_token(a.json()["token"])
    assert token is not None and token.subscription == "sub_ABC123" and token.issued_at == CREATED
    # The same token opens the PRO seasons, like a code's.
    s = client.get("/access/status", headers={"Authorization": f"Bearer {a.json()['token']}"})
    assert s.json()["pro"] is True


def test_success_refuses_unpaid_unknown_and_malformed(stripe):
    stripe.session["payment_status"] = "unpaid"
    assert client.get("/billing/success", params={"session_id": "cs_test_abc"}).status_code == 402
    assert client.get("/billing/success", params={"session_id": "cs_test_nope"}).status_code == 404
    calls = len(stripe.calls)
    assert client.get("/billing/success", params={"session_id": "../subscriptions/sub_ABC123"}).status_code == 404
    assert len(stripe.calls) == calls


def _sub_token(expired: bool = False) -> str:
    stripe_token = client.get("/billing/success", params={"session_id": "cs_test_abc"}).json()["token"]
    if not expired:
        return stripe_token
    from app.core.access import subscription_token
    return encode_token(subscription_token("sub_ABC123", CREATED - 90 * 86400, int(time.time()) - 10))


def test_renewal_extends_while_the_subscription_is_active(stripe):
    old = _sub_token(expired=True)
    assert decode_token(old) is None
    r = client.post("/billing/renew", headers={"Authorization": f"Bearer {old}"})
    assert r.status_code == 200 and decode_token(r.json()["token"]).subscription == "sub_ABC123"


def test_renewal_stops_when_the_subscription_does(stripe):
    tok = _sub_token()
    stripe.sub["status"] = "canceled"
    r = client.post("/billing/renew", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 402 and r.json()["error"]["code"] == "SUBSCRIPTION_INACTIVE"


def test_code_tokens_cannot_renew_or_open_the_portal(stripe):
    code_tok = encode_token(mint_token("deadbeef0000"))
    for path in ("/billing/renew", "/billing/portal"):
        r = client.post(path, headers={"Authorization": f"Bearer {code_tok}"})
        assert r.status_code == 409 and r.json()["error"]["code"] == "NOT_A_SUBSCRIPTION"


def test_portal_session_for_the_subscription_customer(stripe):
    r = client.post("/billing/portal", headers={"Authorization": f"Bearer {_sub_token()}"})
    assert r.json() == {"url": "https://billing.stripe.com/p/session/x"}
    assert stripe.calls[-1][2] == {"customer": "cus_XYZ", "return_url": "https://example.test/settings"}


def test_a_forged_subscription_token_is_refused(stripe):
    tok = _sub_token()
    version, payload, sig = tok.split(".")
    forged = f"{version}.{payload}.{'A' * len(sig)}"
    assert decode_token(forged) is None
    assert client.post("/billing/renew", headers={"Authorization": f"Bearer {forged}"}).status_code == 409


def _signed(body: bytes, t: int, secret: str = "whsec_test") -> str:
    sig = hmac.new(secret.encode(), f"{t}.".encode() + body, hashlib.sha256).hexdigest()
    return f"t={t},v1={sig}"


def test_webhook_verifies_the_signature_and_logs(stripe, caplog):
    body = json.dumps({"id": "evt_1", "type": "customer.subscription.deleted",
                       "data": {"object": {"id": "sub_ABC123", "status": "canceled"}}}).encode()
    caplog.set_level("INFO", logger="app.api.billing")
    now = int(time.time())
    ok = client.post("/billing/webhook", content=body, headers={"Stripe-Signature": _signed(body, now)})
    assert ok.status_code == 200 and ok.json()["received"] is True
    assert "customer.subscription.deleted" in caplog.text
    bad = client.post("/billing/webhook", content=body, headers={"Stripe-Signature": _signed(body, now, "whsec_other")})
    assert bad.status_code == 400
    stale = client.post("/billing/webhook", content=body, headers={"Stripe-Signature": _signed(body, now - 3600)})
    assert stale.status_code == 400
    assert stripe.calls == []


def test_period_end_reads_both_stripe_api_shapes():
    assert stripe_api.period_end({"current_period_end": 5}) == 5
    assert stripe_api.period_end({"items": {"data": [{"current_period_end": 7}, {"current_period_end": 9}]}}) == 9
    assert stripe_api.period_end({}) is None


def test_a_revoked_subscription_stops_at_once(stripe, monkeypatch):
    tok = _sub_token()
    assert client.get("/access/status", headers={"Authorization": f"Bearer {tok}"}).json()["pro"] is True
    monkeypatch.setenv("PAYMENTS_REVOKED_SUBS", " sub_OTHER , sub_ABC123 ")
    assert decode_token(tok) is None
    assert client.get("/access/status", headers={"Authorization": f"Bearer {tok}"}).json()["pro"] is False
    assert client.post("/billing/renew", headers={"Authorization": f"Bearer {tok}"}).status_code == 409
    r = client.get("/billing/success", params={"session_id": "cs_test_abc"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "SUBSCRIPTION_REVOKED"


def test_the_revocation_list_leaves_other_tokens_alone(stripe, monkeypatch):
    tok = _sub_token()
    code_tok = encode_token(mint_token(next(iter(known_code_ids()))))
    monkeypatch.setenv("PAYMENTS_REVOKED_SUBS", "sub_OTHER,,")
    assert decode_token(tok) is not None
    assert decode_token(code_tok) is not None
    monkeypatch.setenv("PAYMENTS_REVOKED_SUBS", "")
    assert decode_token(tok) is not None
