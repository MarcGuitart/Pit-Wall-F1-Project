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
import re
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
    # analysis.py did `from ... import fetch_json`, a separate name binding —
    # patching openf1.fetch_json above does not touch it. Block it here too,
    # or _session_year()'s own direct fetch_json call (Block 23) would be a
    # real, unmocked network call the first time a test exercises a session
    # with no pre-existing _session_meta.json.
    monkeypatch.setattr(analysis_api, "fetch_json", refuse)
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


# ── the internal build secret (Block 18) ─────────────────────────────────────
#
# Production incident: the publication Action computes a PRO-season analysis
# in-process via TestClient, before anyone could hold a user token for a race
# not yet published — 11234 and 11240 (both 2026) 402'd from inside the very
# Action meant to publish them. This is a second, separate way through the
# gate for exactly that caller: not a PRO token, a static shared secret in its
# own header.

BUILD_SECRET = "build-secret-not-a-user-token"


@pytest.fixture
def build_secret_configured(monkeypatch):
    monkeypatch.setattr(settings, "internal_build_secret", SecretStr(BUILD_SECRET))


def test_the_build_secret_opens_a_pro_season_with_no_user_token(client, configured, build_secret_configured):
    r = client.get("/analysis/11377", headers={"X-Internal-Build-Secret": BUILD_SECRET})
    assert r.status_code != 402 and error_code(r) != "PRO_REQUIRED"


def test_a_wrong_build_secret_is_refused(client, configured, build_secret_configured):
    r = client.get("/analysis/11377", headers={"X-Internal-Build-Secret": "not-the-secret"})
    assert error_code(r) == "PRO_REQUIRED"


def test_no_build_secret_configured_means_the_header_grants_nothing(client, configured):
    """Fails closed: an unset secret must not make the header a universal key."""
    r = client.get("/analysis/11377", headers={"X-Internal-Build-Secret": ""})
    assert error_code(r) == "PRO_REQUIRED"
    r2 = client.get("/analysis/11377", headers={"X-Internal-Build-Secret": "anything"})
    assert error_code(r2) == "PRO_REQUIRED"


def test_the_build_secret_is_not_accepted_as_a_bearer_token(client, configured, build_secret_configured):
    """It is a distinct header on purpose — it must never be confused with, or
    substitutable for, a user's Authorization: Bearer."""
    r = client.get("/analysis/11377", headers=auth(BUILD_SECRET))
    assert error_code(r) == "PRO_REQUIRED"


def test_a_user_token_is_not_accepted_as_the_build_secret(client, configured, build_secret_configured):
    """And the reverse: a real user token must not open the build path either."""
    t = token(client)
    r = client.get("/analysis/11377", headers={"X-Internal-Build-Secret": t})
    assert error_code(r) == "PRO_REQUIRED"


def test_the_build_secret_works_on_chat_and_telemetry_too(client, configured, build_secret_configured):
    headers = {"X-Internal-Build-Secret": BUILD_SECRET}
    assert error_code(client.post("/chat", json={"session_key": 11377, "question": "x"},
                                  headers=headers)) != "PRO_REQUIRED"
    assert error_code(client.get("/telemetry/11377", headers=headers)) != "PRO_REQUIRED"


def test_the_build_secret_grants_no_more_than_a_free_season_already_had(client, configured, build_secret_configured):
    """It only ever has to overcome the PRO gate — nothing else changes."""
    with_secret = client.get("/analysis/9539", headers={"X-Internal-Build-Secret": BUILD_SECRET})
    without = client.get("/analysis/9539")
    assert with_secret.status_code == without.status_code


# ── fails closed: Block 23 ───────────────────────────────────────────────────
#
# INTERNAL_BUILD_SECRET is deliberately absent from Render (render.yaml says
# so explicitly). These pin the two ways "not configured" could otherwise leak
# open: the header simply missing, and the classic empty-string-equals-
# empty-string trap on a comparison that forgot to check for that first.

def test_no_secret_configured_and_no_header_sent_at_all_is_refused(client, configured):
    """Not even the header key present — the common case in practice, since a
    caller with nothing to send usually sends nothing, not an empty string."""
    r = client.get("/analysis/11377")
    assert error_code(r) == "PRO_REQUIRED"


def test_no_secret_configured_and_an_empty_header_is_refused(client, configured):
    """The trap this guards against: an unset settings secret defaults to "",
    and "" == "" must never be how a comparison decides "match"."""
    r = client.get("/analysis/11377", headers={"X-Internal-Build-Secret": ""})
    assert error_code(r) == "PRO_REQUIRED"


def test_has_internal_build_access_returns_false_before_reading_any_header_when_unconfigured():
    """
    Unit-level, not just through the HTTP gate: with no secret configured,
    has_internal_build_access() must short-circuit to False without needing a
    header at all — asserted directly against a bare Request-like object with
    no headers, which the full-app test above cannot distinguish from "the
    header lookup happened to return an empty default".
    """
    class NoHeaders:
        headers: dict = {}

    assert access.has_internal_build_access(NoHeaders()) is False  # type: ignore[arg-type]


def test_the_comparison_is_hmac_compare_digest_not_equality(build_secret_configured):
    """
    Static, not behavioural: a plain `==` and compare_digest agree on every
    input this test suite could construct, so the only way to actually pin
    down that the timing-safe comparison is what's used is to read the source.
    """
    import inspect
    source = inspect.getsource(access.has_internal_build_access)
    assert "hmac.compare_digest(" in source
    assert re.search(r"provided\s*==\s*secret|secret\s*==\s*provided", source) is None


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


# ── a refused request writes nothing to disk — Block 23 ─────────────────────
#
# Production: the gate's own year lookup used to fall back to
# _fetch_session_meta(), which caches by writing _session_meta.json
# unconditionally — including for a session the gate was about to refuse. The
# publication Action then committed that orphaned file as if the race had
# published, for 11234 and 11240, with no _analysis.json alongside it. The
# fixed year lookup answers from a plain, uncached fetch, so this is the
# regression: a brand-new session's own directory must not exist at all after
# a 402, not just be missing analysis.json.

def test_a_refused_pro_session_leaves_no_file_on_disk(client, configured, monkeypatch, tmp_path):
    """The exact production failure, reproduced: a session with no local cache
    at all, refused for lack of a token — its directory must never be created."""
    import app.api.analysis as analysis_api

    async def fake_fetch(endpoint, **params):
        # _session_year's own path only ever asks for "sessions"; the old,
        # buggy path (_fetch_session_meta) also asks for "meetings" — handled
        # here too, so this proves the fix by actually letting the old path
        # run to completion instead of accidentally short-circuiting it.
        if endpoint == "sessions":
            return [{"session_key": 11234, "year": 2026, "meeting_key": 1, "session_type": "Race"}]
        if endpoint == "meetings":
            return [{"meeting_name": "Test Grand Prix"}]
        raise AssertionError(f"unexpected endpoint: {endpoint}")

    monkeypatch.setattr(analysis_api, "fetch_json", fake_fetch)

    session_dir = tmp_path / "11234"
    assert not session_dir.exists()

    r = client.get("/analysis/11234")
    assert error_code(r) == "PRO_REQUIRED"
    assert not session_dir.exists(), (
        "a refused request must not create the session's cache directory at all"
    )


def test_session_year_never_calls_the_caching_fetch_function(monkeypatch, tmp_path):
    """
    Direct, fixture-independent proof of the fix: _session_year()'s network
    fallback must go through a plain fetch_json(), never through
    _fetch_session_meta() (the function whose side effect — an unconditional
    cache write — was the actual bug). Calling _fetch_session_meta at all from
    this path, even if it somehow wrote somewhere harmless, is the regression.
    """
    import app.api.analysis as analysis_api

    monkeypatch.setattr(settings, "cache_dir", str(tmp_path))

    async def spy_fetch_session_meta(session_key):
        raise AssertionError("_session_year must not call _fetch_session_meta")

    async def fake_fetch_json(endpoint, **params):
        assert endpoint == "sessions"
        return [{"session_key": 99999, "year": 2026}]

    monkeypatch.setattr(analysis_api, "_fetch_session_meta", spy_fetch_session_meta)
    monkeypatch.setattr(analysis_api, "fetch_json", fake_fetch_json)

    import asyncio
    year = asyncio.run(analysis_api._session_year(99999))
    assert year == 2026


def test_a_refused_pro_session_does_not_touch_an_existing_directory_either(
    client, configured, monkeypatch, tmp_path
):
    """The other shape the bug could take: a session directory that already
    exists (from an earlier, unrelated attempt) must not gain a fresh
    _session_meta.json from a request that then gets refused."""
    import app.api.analysis as analysis_api

    async def fake_fetch(endpoint, **params):
        if endpoint == "sessions":
            return [{"session_key": 11240, "year": 2026, "meeting_key": 1, "session_type": "Race"}]
        if endpoint == "meetings":
            return [{"meeting_name": "Test Grand Prix"}]
        raise AssertionError(f"unexpected endpoint: {endpoint}")

    monkeypatch.setattr(analysis_api, "fetch_json", fake_fetch)

    session_dir = tmp_path / "11240"
    session_dir.mkdir()  # exists, but empty — nothing published for it yet

    r = client.get("/analysis/11240")
    assert error_code(r) == "PRO_REQUIRED"
    assert list(session_dir.iterdir()) == [], (
        "a refused request must not write _session_meta.json into an "
        "already-existing but otherwise empty session directory"
    )
