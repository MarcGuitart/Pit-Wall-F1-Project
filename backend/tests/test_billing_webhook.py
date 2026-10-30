"""
The Stripe webhook (block 44b): the signature in every way it can be wrong, and the events that act. No network: the
Stripe fixture of test_billing.py fails any unexpected call.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time

import pytest

from app.core import billing_revocation
from app.core.access import decode_token
from tests.test_billing import _signed, _sub_token, client, stripe  # noqa: F401  (the fixture)


@pytest.fixture(autouse=True)
def fresh_runtime_list():
    billing_revocation._reset_runtime_for_tests()
    yield
    billing_revocation._reset_runtime_for_tests()


def post(body: dict, header: str | None = None, at: int | None = None, secret: str = "whsec_test"):
    raw = json.dumps(body).encode()
    sig = header if header is not None else _signed(raw, at if at is not None else int(time.time()), secret)
    return client.post("/billing/webhook", content=raw, headers={"Stripe-Signature": sig} if sig else {})


def event(etype: str, obj: dict) -> dict:
    return {"id": f"evt_{etype}", "type": etype, "data": {"object": obj}}


DELETED = event("customer.subscription.deleted", {"id": "sub_ABC123", "status": "canceled", "metadata": {}})


# ── the signature ────────────────────────────────────────────────────────────

def test_a_valid_signature_is_accepted(stripe):
    assert post(event("checkout.session.completed", {"id": "cs_test_abc"})).json() == {"received": True, "action": "logged"}


@pytest.mark.parametrize("why, kwargs", [
    ("another secret", {"secret": "whsec_other"}),
    ("older than five minutes", {"at": int(time.time()) - 400}),
    ("more than five minutes in the future", {"at": int(time.time()) + 400}),
    ("no header", {"header": ""}),
    ("no timestamp", {"header": "v1=" + "0" * 64}),
    ("a timestamp that is not a number", {"header": "t=soon,v1=" + "0" * 64}),
    ("no v1 signature", {"header": f"t={int(time.time())}"}),
])
def test_a_bad_signature_is_refused_and_changes_nothing(stripe, why, kwargs):
    r = post(DELETED, **kwargs)
    assert r.status_code == 400 and r.json()["error"]["code"] == "BAD_SIGNATURE", why
    assert not billing_revocation.is_revoked("sub_ABC123")


def test_a_tampered_body_is_refused(stripe):
    raw = json.dumps(DELETED).encode()
    sig = _signed(raw, int(time.time()))
    tampered = raw.replace(b"sub_ABC123", b"sub_ABC124")
    assert client.post("/billing/webhook", content=tampered, headers={"Stripe-Signature": sig}).status_code == 400


def test_one_good_v1_among_several_is_enough(stripe):
    raw = json.dumps(event("checkout.session.completed", {"id": "cs_test_abc"})).encode()
    t = int(time.time())
    good = hmac.new(b"whsec_test", f"{t}.".encode() + raw, hashlib.sha256).hexdigest()
    header = f"t={t},v1={'f' * 64},v1={good}"                     # Stripe sends one per secret while rolling
    assert client.post("/billing/webhook", content=raw, headers={"Stripe-Signature": header}).status_code == 200


def test_no_secret_configured_refuses_everything(stripe, monkeypatch):
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "")
    assert post(DELETED).status_code == 400


def test_payments_off_answers_503_before_reading_anything(stripe, monkeypatch):
    monkeypatch.setenv("PAYMENTS_ENABLED", "")
    assert post(DELETED).status_code == 503


# ── the events that act ──────────────────────────────────────────────────────

def test_subscription_deleted_revokes_its_tokens_at_once(stripe):
    tok = _sub_token()
    assert decode_token(tok) is not None
    assert post(DELETED).json()["action"] == "revoked"
    assert decode_token(tok) is None
    assert client.get("/access/status", headers={"Authorization": f"Bearer {tok}"}).json()["pro"] is False


@pytest.mark.parametrize("invoice", [
    {"id": "in_1", "subscription": "sub_ABC123"},                                               # older API shape
    {"id": "in_1", "parent": {"subscription_details": {"subscription": "sub_ABC123"}}},       # 2025 onwards
])
def test_payment_failed_revokes_in_both_invoice_shapes(stripe, invoice):
    tok = _sub_token()
    assert post(event("invoice.payment_failed", invoice)).json()["action"] == "revoked"
    assert decode_token(tok) is None


def test_a_payment_that_later_succeeds_reinstates(stripe):
    tok = _sub_token()
    post(event("invoice.payment_failed", {"id": "in_1", "subscription": "sub_ABC123"}))
    assert decode_token(tok) is None
    r = post(event("customer.subscription.updated", {"id": "sub_ABC123", "status": "active"}))
    assert r.json()["action"] == "reinstated"
    assert decode_token(tok) is not None


def test_an_update_never_reinstates_a_deleted_subscription(stripe):
    tok = _sub_token()
    post(DELETED)
    assert post(event("customer.subscription.updated", {"id": "sub_ABC123", "status": "active"})).json()["action"] == "logged"
    assert decode_token(tok) is None


def test_events_are_idempotent(stripe):
    assert post(DELETED).json()["action"] == "revoked"
    assert post(DELETED).json()["action"] == "revoked"
    assert billing_revocation.runtime_reason("sub_ABC123") == "deleted"


def test_an_event_without_a_subscription_is_logged(stripe):
    assert post(event("invoice.payment_failed", {"id": "in_2"})).json()["action"] == "logged"
    assert post(event("customer.subscription.deleted", {"id": "not-a-sub"})).json()["action"] == "logged"


def test_the_runtime_list_is_lost_on_a_restart_and_the_environment_one_is_not(stripe, monkeypatch):
    """What a restart loses (documented in app/core/billing_revocation.py and docs/PAYMENTS.md)."""
    post(DELETED)
    monkeypatch.setenv("PAYMENTS_REVOKED_SUBS", "sub_KEPT")
    billing_revocation._reset_runtime_for_tests()                 # a new process
    assert not billing_revocation.is_revoked("sub_ABC123")
    assert billing_revocation.is_revoked("sub_KEPT")
