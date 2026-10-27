"""
/billing/restore (block 44b): the same answer whatever the email, a signed 15 minute link by Resend only for an active
subscription, and that link's redemption. Stripe and Resend are simulated; nothing reaches the network.
"""
from __future__ import annotations

import json
import time

import httpx
import pytest

from app.api import billing
from app.core import billing_revocation, resend_api, stripe_api
from app.core.access import decode_token
from tests.test_billing import client, stripe  # noqa: F401  (the fixture)

KNOWN = "reader@example.com"


class Mail:
    def __init__(self):
        self.sent: list[dict] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        assert request.url == httpx.URL(resend_api.API_URL)
        assert request.headers["authorization"] == "Bearer re_test"
        self.sent.append(json.loads(request.content))
        return httpx.Response(200, json={"id": "email_1"})


@pytest.fixture
def mail(stripe, monkeypatch):
    """Stripe answers customers and subscriptions by email; Resend records what would be sent."""
    base = stripe.handler

    def handler(request: httpx.Request) -> httpx.Response:
        path, q = request.url.path, request.url.params
        if request.method == "GET" and path == "/v1/customers":
            stripe.calls.append(("GET", path, dict(q)))
            return httpx.Response(200, json={"data": [{"id": "cus_XYZ"}] if q.get("email") == KNOWN else []})
        if request.method == "GET" and path == "/v1/subscriptions":
            stripe.calls.append(("GET", path, dict(q)))
            return httpx.Response(200, json={"data": [stripe.sub]})
        return base(request)

    stripe_api.set_transport(httpx.MockTransport(handler))
    box = Mail()
    resend_api.set_transport(httpx.MockTransport(box.handler))
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("RESEND_FROM", "Pit Wall Engineer <access@example.test>")
    for lim in (billing._restore_ip_limiter, billing._restore_email_limiter):
        lim.reset()
    billing_revocation._reset_runtime_for_tests()
    yield box
    resend_api.set_transport(None)


def ask(email: str):
    return client.post("/billing/restore", json={"email": email})


def link_token(box: Mail) -> str:
    text = box.sent[-1]["text"]
    return text.split("token=")[1].split()[0]


def test_the_answer_is_the_same_for_a_subscriber_a_stranger_and_nonsense(mail):
    answers = [ask(e) for e in (KNOWN, "nobody@example.com", "not an email")]
    assert {a.status_code for a in answers} == {200}
    assert len({a.text for a in answers}) == 1
    assert answers[0].json()["message"].startswith("If an active subscription uses that email")
    assert len(mail.sent) == 1 and mail.sent[0]["to"] == [KNOWN]


def test_the_link_goes_to_the_site_and_works_for_15_minutes(mail):
    ask(KNOWN)
    msg = mail.sent[0]
    assert "https://example.test/billing/restore?token=rs1." in msg["text"]
    assert "15 minutes" in msg["text"] and msg["from"] == "Pit Wall Engineer <access@example.test>"
    sub = billing.read_restore_token(link_token(mail))
    assert sub == "sub_ABC123"
    with pytest.raises(Exception) as e:
        billing.read_restore_token(link_token(mail), now=int(time.time()) + 15 * 60 + 1)
    assert getattr(e.value, "code", None) == "RESTORE_LINK_EXPIRED"


def test_redeeming_the_link_gives_a_pro_token(mail):
    ask(KNOWN)
    r = client.post("/billing/restore/redeem", json={"token": link_token(mail)})
    assert r.status_code == 200
    tok = decode_token(r.json()["token"])
    assert tok is not None and tok.subscription == "sub_ABC123"


@pytest.mark.parametrize("mangle, code", [
    (lambda t: t[:-2] + ("AA" if not t.endswith("AA") else "BB"), "RESTORE_LINK_INVALID"),   # signature
    (lambda t: "rs2" + t[3:], "RESTORE_LINK_INVALID"),                                        # prefix
    (lambda t: t.split(".")[0] + "." + t.split(".")[1], "RESTORE_LINK_INVALID"),              # no signature
])
def test_a_tampered_link_is_refused(mail, mangle, code):
    ask(KNOWN)
    r = client.post("/billing/restore/redeem", json={"token": mangle(link_token(mail))})
    assert r.status_code == 400 and r.json()["error"]["code"] == code


def test_a_link_for_a_subscription_cancelled_since_is_refused(mail, stripe):
    ask(KNOWN)
    stripe.sub = {**stripe.sub, "status": "canceled"}
    r = client.post("/billing/restore/redeem", json={"token": link_token(mail)})
    assert r.status_code == 402


def test_no_link_for_an_inactive_or_revoked_subscription(mail, stripe, monkeypatch):
    stripe.sub = {**stripe.sub, "status": "canceled"}
    ask(KNOWN)
    assert mail.sent == []
    stripe.sub = {**stripe.sub, "status": "active"}
    monkeypatch.setenv("PAYMENTS_REVOKED_SUBS", "sub_ABC123")
    billing._restore_email_limiter.reset()
    ask(KNOWN)
    assert mail.sent == []


def test_over_the_limits_the_answer_is_the_same_and_nothing_is_looked_up(mail, stripe):
    for _ in range(billing.RESTORE_EMAIL_LIMIT):
        ask(KNOWN)
    lookups = len([c for c in stripe.calls if c[1] == "/v1/customers"])
    r = ask(KNOWN)
    assert r.status_code == 200 and r.json()["message"] == billing.RESTORE_ANSWER
    assert len([c for c in stripe.calls if c[1] == "/v1/customers"]) == lookups


def test_without_resend_configured_nothing_breaks(mail, monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "")
    assert ask(KNOWN).status_code == 200
    assert mail.sent == []


def test_a_resend_or_stripe_failure_is_swallowed(mail, monkeypatch):
    resend_api.set_transport(httpx.MockTransport(lambda r: httpx.Response(500)))
    assert ask(KNOWN).status_code == 200
    stripe_api.set_transport(httpx.MockTransport(lambda r: httpx.Response(500, json={"error": {"type": "api_error"}})))
    billing._restore_email_limiter.reset()
    assert ask(KNOWN).status_code == 200


def test_payments_off_is_503_as_every_billing_route(mail, monkeypatch):
    monkeypatch.setenv("PAYMENTS_ENABLED", "")
    assert ask(KNOWN).status_code == 503
