"""
Public promo codes (PRO_PROMO_CODES): CODE|instant, redeemable by anyone, any
number of times, in any case, until that instant. Past it the code stops
redeeming, and the tokens it already minted keep working until their own expiry.

The codes here are test values. The real one lives in Render's environment only.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.core import access
from app.core.config import settings
from app.main import app

PROMO = "TESTPROMO9"
ENDS = "2026-11-10T23:59:00+01:00"
SECRET = "test-signing-secret-not-the-real-one"
BEFORE = datetime(2026, 11, 10, 22, 58, tzinfo=timezone.utc)   # 23:58 CET
AFTER = datetime(2026, 11, 10, 22, 59, tzinfo=timezone.utc)    # 23:59 CET, the end itself


@pytest.fixture
def configured(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "pro_access_codes", [])
    monkeypatch.setattr(settings, "pro_promo_codes", [f"{PROMO}|{ENDS}"])
    monkeypatch.setattr(settings, "pro_promo_token_ttl_days", 7)
    monkeypatch.setattr(settings, "pro_token_secret", SecretStr(SECRET))
    monkeypatch.setattr(settings, "free_seasons", [2023, 2024])
    monkeypatch.setattr(settings, "cache_dir", str(tmp_path))
    monkeypatch.delenv("OPEN_ACCESS_UNTIL", raising=False)
    monkeypatch.setattr(access, "_now", lambda: BEFORE)
    for key, year in ((9539, 2024), (9636, 2024), (9990, 2025), (11377, 2026)):
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
    async def refuse(*args, **kwargs):
        raise AssertionError("a promo test tried to reach the network")

    import app.api.analysis as analysis_api
    import app.clients.openf1_client as openf1
    monkeypatch.setattr(openf1, "fetch_json", refuse)
    monkeypatch.setattr(analysis_api, "fetch_json", refuse)
    monkeypatch.setattr(analysis_api, "load_session", refuse)
    monkeypatch.setattr(analysis_api, "_fetch_session_meta", refuse)


@pytest.fixture(autouse=True)
def fresh_limiter():
    from app.api import access as access_api
    from app.core.ratelimit import SlidingWindow
    access_api._redeem_limiter = SlidingWindow(access_api.REDEEM_LIMIT, access_api.REDEEM_WINDOW_S)
    yield


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


def redeem(client, code: str):
    return client.post("/access/redeem", json={"code": code})


def auth(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


def error_code(response) -> str | None:
    return (response.json().get("error") or {}).get("code")


# ── redemption ───────────────────────────────────────────────────────────────

def test_a_running_promo_redeems_for_a_token_of_its_own_length(client, configured):
    r = redeem(client, PROMO)
    assert r.status_code == 200, r.text
    body = r.json()
    assert abs(body["expires_at"] - (int(time.time()) + 7 * 86400)) <= 5
    assert client.get("/access/status", headers=auth(body["token"])).json()["pro"] is True


def test_a_wrong_code_is_refused(client, configured):
    r = redeem(client, "NOTTHECODE")
    assert r.status_code == 401
    assert error_code(r) == "INVALID_ACCESS_CODE"


def test_an_ended_promo_no_longer_redeems(client, configured, monkeypatch):
    monkeypatch.setattr(access, "_now", lambda: AFTER)
    r = redeem(client, PROMO)
    assert r.status_code == 410
    assert error_code(r) == "PROMO_EXPIRED"


@pytest.mark.parametrize("typed", [PROMO.lower(), "TestPromo9", f"  {PROMO.lower()}  "])
def test_case_and_surrounding_spaces_do_not_matter(client, configured, typed):
    assert redeem(client, typed).status_code == 200


def test_ordinary_access_codes_stay_case_sensitive(client, configured, monkeypatch):
    monkeypatch.setattr(settings, "pro_access_codes", ["Owner-Code-Only"])
    assert redeem(client, "Owner-Code-Only").status_code == 200
    assert error_code(redeem(client, "owner-code-only")) == "INVALID_ACCESS_CODE"


def test_the_same_promo_redeems_again_and_again(client, configured):
    tokens = [redeem(client, PROMO) for _ in range(3)]
    assert [r.status_code for r in tokens] == [200, 200, 200]


def test_redemption_is_rate_limited_per_address(client, configured):
    from app.api import access as access_api
    codes = [redeem(client, PROMO if i % 2 else "WRONG").status_code for i in range(access_api.REDEEM_LIMIT)]
    assert 429 not in codes
    r = redeem(client, PROMO)
    assert r.status_code == 429
    assert error_code(r) == "RATE_LIMITED"


def test_a_redeemed_token_outlives_the_promo(client, configured, monkeypatch):
    t = redeem(client, PROMO).json()["token"]
    monkeypatch.setattr(access, "_now", lambda: AFTER)
    assert error_code(redeem(client, PROMO)) == "PROMO_EXPIRED"
    assert client.get("/access/status", headers=auth(t)).json()["pro"] is True
    assert error_code(client.get("/analysis/11377", headers=auth(t))) != "PRO_REQUIRED"


def test_removing_the_entry_revokes_its_tokens(client, configured, monkeypatch):
    t = redeem(client, PROMO).json()["token"]
    monkeypatch.setattr(settings, "pro_promo_codes", [])
    assert client.get("/access/status", headers=auth(t)).json()["pro"] is False


@pytest.mark.parametrize("entry", [
    PROMO,                                  # no end
    f"{PROMO}|2026-11-10T23:59:00",         # no zone
    f"{PROMO}|next tuesday",                # not a date
    f"|{ENDS}",                             # no code
])
def test_a_malformed_entry_opens_nothing(client, configured, monkeypatch, entry):
    monkeypatch.setattr(settings, "pro_promo_codes", [entry])
    r = redeem(client, PROMO)
    assert r.status_code in (401, 503)
    assert client.get("/access/promo").json()["active"] is False


# ── what a promo token unlocks ───────────────────────────────────────────────

@pytest.mark.parametrize("key", [9990, 11377])     # 2025 and the current season
def test_a_promo_token_opens_every_pro_season(client, configured, key):
    t = redeem(client, PROMO).json()["token"]
    assert error_code(client.get(f"/analysis/{key}")) == "PRO_REQUIRED"
    r = client.get(f"/analysis/{key}", headers=auth(t))
    assert r.status_code != 402 and error_code(r) != "PRO_REQUIRED"
    assert error_code(client.get(f"/telemetry/{key}", headers=auth(t))) != "PRO_REQUIRED"


# ── the banner's endpoint ────────────────────────────────────────────────────

def test_the_banner_reads_the_running_promo(client, configured):
    r = client.get("/access/promo")
    assert r.status_code == 200
    assert r.json() == {"active": True, "code": PROMO, "until": "2026-11-10T23:59:00+01:00", "days": 7}
    assert "max-age=60" in r.headers["cache-control"]


def test_the_banner_goes_once_the_promo_ends(client, configured, monkeypatch):
    monkeypatch.setattr(access, "_now", lambda: AFTER)
    assert client.get("/access/promo").json() == {"active": False, "code": None, "until": None, "days": None}


def test_with_no_promo_configured_the_banner_is_off(client, configured, monkeypatch):
    monkeypatch.setattr(settings, "pro_promo_codes", [])
    assert client.get("/access/promo").json()["active"] is False


# ── no open week in this deploy ──────────────────────────────────────────────

def test_without_open_access_until_a_visitor_is_a_free_user(client, configured):
    """OPEN_ACCESS_UNTIL unset: the free seasons open, every PRO one asks for access."""
    assert client.get("/access/open").json() == {"open": False, "until": None}
    assert error_code(client.get("/analysis/9539")) != "PRO_REQUIRED"
    for key in (9990, 11377):
        assert error_code(client.get(f"/analysis/{key}")) == "PRO_REQUIRED"
    assert client.get("/access/status").json()["pro"] is False
