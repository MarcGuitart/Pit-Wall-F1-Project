"""
The PRO gate: free seasons open, everything else behind a valid token.

The four the brief asked for, and the things around them that would each be a
quiet way in:

  a free session with no token          200
  a PRO session with no token           PRO_REQUIRED
  an expired or badly signed token      rejected
  /chat with a PRO session_key          rejected — not a back door

No network. The cache directory is temporary and OpenF1 is cut off outright, so
a request that gets past the gate fails immediately with a different error —
which is the assertion for the free cases: not 200, but *not the gate*.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.core import access
from app.core.config import settings
from app.main import app

CODE = "PW-test-code-never-a-real-one"
SECRET = "test-signing-secret-not-the-real-one"


@pytest.fixture
def configured(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "pro_access_codes", [CODE])
    monkeypatch.setattr(settings, "pro_token_secret", SecretStr(SECRET))
    monkeypatch.setattr(settings, "free_seasons", [2023, 2024])
    monkeypatch.setattr(settings, "cache_dir", str(tmp_path))
    # a free season and a PRO season, each with just enough metadata
    for key, year in ((9539, 2024), (11377, 2026)):
        d = tmp_path / str(key)
        d.mkdir()
        (d / "_session_meta.json").write_text(json.dumps({
            "session_key": key, "year": year, "meeting_name": "Test Grand Prix",
            "session_name": "Race", "session_type": "Race",
            "date_start": f"{year}-05-01T13:00:00+00:00",
            "date_end": f"{year}-05-01T15:00:00+00:00",
        }))
    return tmp_path


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """
    Nothing in this file may reach OpenF1. Anything that does is a test asserting
    something other than the gate, and it would be slow and flaky besides.
    """
    async def refuse(*args, **kwargs):
        raise AssertionError("a PRO-gate test tried to reach the network")

    import app.api.analysis as analysis_api
    import app.clients.openf1_client as openf1
    monkeypatch.setattr(openf1, "fetch_json", refuse)
    monkeypatch.setattr(analysis_api, "load_session", refuse)
    monkeypatch.setattr(analysis_api, "_fetch_session_meta", refuse)


@pytest.fixture(autouse=True)
def fresh_limiter():
    """The redeem limiter is module state; 10 tries per IP would leak across tests."""
    from app.api import access as access_api
    from app.core.ratelimit import SlidingWindow
    access_api._redeem_limiter = SlidingWindow(access_api.REDEEM_LIMIT, access_api.REDEEM_WINDOW_S)
    yield


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


def token(client) -> str:
    r = client.post("/access/redeem", json={"code": CODE})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def auth(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


def error_code(response) -> str | None:
    return (response.json().get("error") or {}).get("code")


# ── the four required cases ──────────────────────────────────────────────────

def test_a_free_session_needs_no_token(client, configured):
    """
    Past the gate. With the network cut off it cannot then produce an analysis,
    so what is asserted is that the refusal is not the gate's.
    """
    r = client.get("/analysis/9539")
    assert r.status_code != 402
    assert error_code(r) != "PRO_REQUIRED"


def test_a_pro_session_without_a_token_is_refused(client, configured):
    r = client.get("/analysis/11377")
    assert r.status_code == 402
    assert error_code(r) == "PRO_REQUIRED"
    details = r.json()["error"]["details"]
    assert details["year"] == 2026
    assert details["free_seasons"] == [2023, 2024]


@pytest.mark.parametrize("bad, why", [
    ("", "empty"),
    ("garbage", "not a token"),
    ("v1.payload", "two parts"),
    ("v1.payload.signature.extra", "four parts"),
    ("v2.eyJjaWQiOiJ4In0.sig", "wrong version"),
])
def test_a_malformed_token_is_refused(client, configured, bad, why):
    r = client.get("/analysis/11377", headers=auth(bad))
    assert error_code(r) == "PRO_REQUIRED", why


def test_a_tampered_payload_is_refused(client, configured):
    """The signature is over the payload, so editing the claims invalidates it."""
    good = token(client)
    version, payload, signature = good.split(".")
    forged = access.b64(json.dumps(
        {"cid": access.code_id(CODE), "iat": 0, "exp": int(time.time()) + 10 ** 6},
        separators=(",", ":"), sort_keys=True).encode())
    assert forged != payload or True
    r = client.get("/analysis/11377", headers=auth(f"{version}.{forged}.{signature}"))
    assert error_code(r) == "PRO_REQUIRED"


def test_a_token_signed_with_another_secret_is_refused(client, configured, monkeypatch):
    good = token(client)
    monkeypatch.setattr(settings, "pro_token_secret", SecretStr("a-different-secret"))
    r = client.get("/analysis/11377", headers=auth(good))
    assert error_code(r) == "PRO_REQUIRED"


def test_an_expired_token_is_refused(client, configured):
    expired = access.AccessToken(code_id=access.code_id(CODE),
                                 issued_at=int(time.time()) - 100,
                                 expires_at=int(time.time()) - 1)
    r = client.get("/analysis/11377", headers=auth(access.encode_token(expired)))
    assert error_code(r) == "PRO_REQUIRED"


def test_chat_with_a_pro_session_key_and_no_token_is_refused(client, configured):
    """
    /chat reads the analysis straight from disk. Without its own gate, a PRO race
    that had been computed once would be readable in prose by anyone who knew the
    session key.
    """
    r = client.post("/chat", json={"session_key": 11377, "question": "who won?"})
    assert error_code(r) == "PRO_REQUIRED"


def test_chat_with_a_free_session_key_is_not_refused_by_the_gate(client, configured):
    r = client.post("/chat", json={"session_key": 9539, "question": "who won?"})
    assert error_code(r) != "PRO_REQUIRED"


def test_telemetry_with_a_pro_session_key_and_no_token_is_refused(client, configured):
    """Telemetry has its own pre-computed files and never calls /analysis."""
    r = client.get("/telemetry/11377")
    assert error_code(r) == "PRO_REQUIRED"


# ── a valid token opens it ───────────────────────────────────────────────────

def test_a_valid_token_opens_a_pro_season(client, configured):
    r = client.get("/analysis/11377", headers=auth(token(client)))
    assert r.status_code != 402 and error_code(r) != "PRO_REQUIRED"


def test_a_valid_token_opens_chat_and_telemetry_too(client, configured):
    t = token(client)
    assert error_code(client.post("/chat", json={"session_key": 11377, "question": "x"},
                                  headers=auth(t))) != "PRO_REQUIRED"
    assert error_code(client.get("/telemetry/11377", headers=auth(t))) != "PRO_REQUIRED"


def test_the_header_is_bearer_and_no_cookie_is_ever_set(client, configured):
    """
    Frontend and API are on different domains, so a cookie between them is a
    third-party cookie and Safari blocks it. Nothing here may rely on one.
    """
    r = client.post("/access/redeem", json={"code": CODE})
    assert "set-cookie" not in {k.lower() for k in r.headers}
    t = r.json()["token"]
    # the header must be Bearer; a bare token is not accepted
    assert error_code(client.get("/analysis/11377", headers={"Authorization": t})) == "PRO_REQUIRED"
    assert client.get("/analysis/11377", headers=auth(t)).status_code != 402


# ── redemption ───────────────────────────────────────────────────────────────

def test_a_wrong_code_is_rejected_and_yields_no_token(client, configured):
    r = client.post("/access/redeem", json={"code": "not-the-code"})
    assert r.status_code == 401
    assert error_code(r) == "INVALID_ACCESS_CODE"
    assert "token" not in r.json()


def test_the_code_is_never_echoed_back(client, configured):
    """Not in the message, not in details — it is the long-lived secret."""
    r = client.post("/access/redeem", json={"code": "not-the-code"})
    assert "not-the-code" not in r.text
    ok = client.post("/access/redeem", json={"code": CODE})
    assert CODE not in ok.text


def test_surrounding_whitespace_in_a_pasted_code_is_forgiven(client, configured):
    assert client.post("/access/redeem", json={"code": f"  {CODE}\n"}).status_code == 200


def test_redemption_is_rate_limited_per_ip(client, configured):
    from app.api.access import REDEEM_LIMIT
    for _ in range(REDEEM_LIMIT):
        client.post("/access/redeem", json={"code": "wrong"})
    r = client.post("/access/redeem", json={"code": "wrong"})
    assert r.status_code == 429 and error_code(r) == "RATE_LIMITED"
    # and a correct code cannot be used to step around the limit either
    assert client.post("/access/redeem", json={"code": CODE}).status_code == 429


def test_a_revoked_code_stops_working_before_its_tokens_expire(client, configured, monkeypatch):
    t = token(client)
    assert client.get("/analysis/11377", headers=auth(t)).status_code != 402
    monkeypatch.setattr(settings, "pro_access_codes", ["some-other-code"])
    assert error_code(client.get("/analysis/11377", headers=auth(t))) == "PRO_REQUIRED"


# ── failing closed ───────────────────────────────────────────────────────────

def test_no_secret_configured_disables_redemption_rather_than_signing_with_a_default(
    client, configured, monkeypatch,
):
    monkeypatch.setattr(settings, "pro_token_secret", SecretStr(""))
    r = client.post("/access/redeem", json={"code": CODE})
    assert r.status_code == 503 and error_code(r) == "PRO_ACCESS_UNAVAILABLE"


def test_no_codes_configured_locks_the_pro_seasons_for_everyone(client, configured, monkeypatch):
    monkeypatch.setattr(settings, "pro_access_codes", [])
    assert client.post("/access/redeem", json={"code": CODE}).status_code == 503
    assert error_code(client.get("/analysis/11377")) == "PRO_REQUIRED"
    # and the free seasons are untouched
    assert error_code(client.get("/analysis/9539")) != "PRO_REQUIRED"


def test_an_unknown_season_is_pro_not_free(client, configured, tmp_path):
    """A session whose year cannot be read must not fall open."""
    assert access.is_free_season(None) is False
    assert access.is_pro_season(None) is True
    d = tmp_path / "99999"
    d.mkdir()
    (d / "_session_meta.json").write_text(json.dumps({"session_key": 99999}))
    assert error_code(client.get("/analysis/99999")) == "PRO_REQUIRED"


def test_force_refresh_cannot_be_used_to_step_around_the_gate(client, configured):
    r = client.get("/analysis/11377?force_refresh=true")
    assert error_code(r) == "PRO_REQUIRED"


def test_a_cached_pro_analysis_on_disk_is_still_gated(client, configured, tmp_path):
    """The gate runs before the cache is read, so being on disk changes nothing."""
    (tmp_path / "11377" / "_analysis.json").write_text(json.dumps({"race": {"year": 2026}}))
    assert error_code(client.get("/analysis/11377")) == "PRO_REQUIRED"


# ── /access/status ───────────────────────────────────────────────────────────

def test_status_without_a_token_is_not_an_error(client, configured):
    r = client.get("/access/status")
    assert r.status_code == 200
    body = r.json()
    assert body["pro"] is False and body["expires_at"] is None
    assert body["free_seasons"] == [2023, 2024]
    assert body["redemption_available"] is True


def test_status_with_a_token_reports_the_expiry(client, configured):
    r = client.get("/access/status", headers=auth(token(client)))
    body = r.json()
    assert body["pro"] is True
    assert 0 < body["expires_in"] <= settings.pro_token_ttl_days * 86400


def test_status_with_an_expired_token_is_simply_not_pro(client, configured):
    expired = access.AccessToken(code_id=access.code_id(CODE),
                                 issued_at=0, expires_at=int(time.time()) - 1)
    r = client.get("/access/status", headers=auth(access.encode_token(expired)))
    assert r.status_code == 200 and r.json()["pro"] is False


def test_status_says_when_redemption_is_not_configured(client, configured, monkeypatch):
    monkeypatch.setattr(settings, "pro_access_codes", [])
    assert client.get("/access/status").json()["redemption_available"] is False


# ── the seasons themselves ───────────────────────────────────────────────────

@pytest.mark.parametrize("year, free", [
    (2023, True), (2024, True), (2025, False), (2026, False), (2027, False),
    (2022, False), (None, False),
])
def test_which_seasons_are_free(monkeypatch, year, free):
    monkeypatch.setattr(settings, "free_seasons", [2023, 2024])
    assert access.is_free_season(year) is free
    assert access.is_pro_season(year) is (not free)
