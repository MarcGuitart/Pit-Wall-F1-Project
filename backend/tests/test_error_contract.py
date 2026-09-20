"""
One test per error code: HTTP status + envelope shape
    {"error": {"code", "message", "details"}}
plus the two structural cases: 422 validation and 500 with CORS headers.

OpenF1 is never contacted: httpx.AsyncClient is swapped for one with a
MockTransport wherever a test would otherwise leave the process.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from app.clients import openf1_client
from app.core import cache
from app.core.config import settings
from app.main import app

ORIGIN = "http://localhost:3000"   # first entry of settings.cors_origins


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def fake_openf1(monkeypatch):
    """Replace httpx.AsyncClient with one that answers from `handler`. Backoff set to 0."""
    monkeypatch.setattr(openf1_client, "_BACKOFF", [0, 0, 0, 0])
    real = httpx.AsyncClient

    def install(handler):
        class Patched(real):
            def __init__(self, *args, **kwargs):
                kwargs["transport"] = httpx.MockTransport(handler)
                super().__init__(*args, **kwargs)
        monkeypatch.setattr(httpx, "AsyncClient", Patched)

    return install


def envelope(resp, status: int, code: str) -> dict:
    assert resp.status_code == status, resp.text
    assert resp.headers["content-type"].startswith("application/json")
    body = resp.json()
    assert set(body) == {"error"}
    err = body["error"]
    assert set(err) == {"code", "message", "details"}
    assert err["code"] == code
    assert isinstance(err["message"], str) and err["message"]
    assert err["details"] is None or isinstance(err["details"], dict)
    return err


# ── Structural ───────────────────────────────────────────────────────────────

def test_validation_error_422(client):
    err = envelope(client.get("/analysis/not-a-number"), 422, "VALIDATION_ERROR")
    assert "session_key" in err["message"]
    assert err["details"]["errors"][0]["loc"] == ["path", "session_key"]


def test_validation_error_422_on_body(client):
    err = envelope(client.post("/chat", json={"question": "x"}), 422, "VALIDATION_ERROR")
    assert "session_key" in err["message"]


def test_unmatched_route_uses_envelope(client):
    envelope(client.get("/does-not-exist"), 404, "NOT_FOUND")
    envelope(client.delete("/health"), 405, "METHOD_NOT_ALLOWED")


def test_internal_error_500_is_json_with_cors_headers(client):
    async def boom():
        raise RuntimeError("deliberate")

    app.add_api_route("/__test_boom", boom, methods=["GET"])
    try:
        resp = client.get("/__test_boom", headers={"Origin": ORIGIN})
    finally:
        app.router.routes[:] = [r for r in app.router.routes if getattr(r, "path", "") != "/__test_boom"]

    err = envelope(resp, 500, "INTERNAL_ERROR")
    assert err["details"] == {"exception": "RuntimeError"}
    # The whole point: the 500 must pass through CORSMiddleware
    assert resp.headers.get("access-control-allow-origin") == ORIGIN
    assert resp.headers.get("access-control-allow-credentials") == "true"


def test_error_responses_carry_cors_headers_too(client):
    resp = client.get("/analysis/not-a-number", headers={"Origin": ORIGIN})
    assert resp.status_code == 422
    assert resp.headers.get("access-control-allow-origin") == ORIGIN


# ── /analysis ────────────────────────────────────────────────────────────────

def test_session_not_cached_404(client, monkeypatch, fake_openf1, tmp_path):
    """No meta, no token, OpenF1 answers 401 -> SESSION_NOT_CACHED (demo mode)."""
    monkeypatch.setattr(settings, "cache_dir", str(tmp_path))   # never touch the real cache
    monkeypatch.setattr(settings, "openf1_api_token", "")

    def handler(req):
        if req.url.path.endswith("/sessions"):
            return httpx.Response(200, json=[])
        return httpx.Response(401, json={"detail": "auth"})
    fake_openf1(handler)

    err = envelope(client.get("/analysis/424242"), 404, "SESSION_NOT_CACHED")
    assert "9636" in err["message"]
    # A 401 is an error, not an answer: nothing may be written to the cache.
    assert list(tmp_path.iterdir()) == []


def test_openf1_unauthorized_503_with_token(client, monkeypatch, fake_openf1, tmp_path):
    """Token configured but rejected -> OPENF1_UNAUTHORIZED, and still nothing cached."""
    monkeypatch.setattr(settings, "cache_dir", str(tmp_path))
    monkeypatch.setattr(settings, "openf1_api_token", "bad-token")

    def handler(req):
        if req.url.path.endswith("/sessions"):
            return httpx.Response(200, json=[])
        return httpx.Response(401, json={"detail": "auth"})
    fake_openf1(handler)

    err = envelope(client.get("/analysis/424242"), 503, "OPENF1_UNAUTHORIZED")
    assert err["details"] == {"endpoint": "laps"}
    assert list(tmp_path.iterdir()) == []


def test_non_list_payload_is_an_error_and_not_cached(client, monkeypatch, fake_openf1, tmp_path):
    monkeypatch.setattr(settings, "cache_dir", str(tmp_path))
    monkeypatch.setattr(settings, "openf1_api_token", "token")
    monkeypatch.setattr(
        cache, "get_session_meta",
        lambda key: {"session_key": key, "date_start": "2024-01-01T00:00:00+00:00", "session_type": "Race"},
    )
    fake_openf1(lambda req: httpx.Response(200, json={"message": "maintenance"}))

    envelope(client.get("/analysis/424249"), 503, "OPENF1_ERROR")
    assert list(tmp_path.iterdir()) == []


def test_session_not_historical_yet_425(client, monkeypatch):
    live = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    monkeypatch.setattr(
        cache, "get_session_meta",
        lambda key: {"session_key": key, "date_start": live, "session_type": "Race"},
    )
    err = envelope(client.get("/analysis/424243"), 425, "SESSION_NOT_HISTORICAL_YET")
    assert isinstance(err["details"]["retry_after_minutes"], int)
    assert err["details"]["unlock_at_utc"]


def test_openf1_rate_limit_429(client, monkeypatch, fake_openf1, tmp_path):
    monkeypatch.setattr(settings, "cache_dir", str(tmp_path))

    def handler(req):
        if req.url.path.endswith("/sessions"):
            return httpx.Response(200, json=[])
        return httpx.Response(429, headers={"Retry-After": "0"}, json=[])
    fake_openf1(handler)

    err = envelope(client.get("/analysis/424244"), 429, "OPENF1_RATE_LIMIT")
    assert err["details"] == {"endpoint": "laps", "attempts": 4}


def test_openf1_error_503_after_retries(client, monkeypatch, fake_openf1, tmp_path):
    monkeypatch.setattr(settings, "cache_dir", str(tmp_path))

    def handler(req):
        if req.url.path.endswith("/sessions"):
            return httpx.Response(200, json=[])
        return httpx.Response(500, text="upstream down")
    fake_openf1(handler)

    err = envelope(client.get("/analysis/424245"), 503, "OPENF1_ERROR")
    assert err["details"] == {"endpoint": "laps", "attempts": 4}
    assert "laps" in err["message"]


def test_openf1_error_503_when_no_laps(client, monkeypatch, fake_openf1, tmp_path):
    """Session meta is known but OpenF1 returns no lap rows at all."""
    monkeypatch.setattr(settings, "cache_dir", str(tmp_path))
    monkeypatch.setattr(settings, "openf1_api_token", "token")
    monkeypatch.setattr(
        cache, "get_session_meta",
        lambda key: {"session_key": key, "date_start": "2024-01-01T00:00:00+00:00", "session_type": "Race"},
    )
    fake_openf1(lambda req: httpx.Response(200, json=[]))

    err = envelope(client.get("/analysis/424246"), 503, "OPENF1_ERROR")
    assert err["details"] == {"endpoint": "laps"}
    # A genuine 200 [] is a real answer and IS cached (unlike a 401).
    assert (tmp_path / "424246" / "laps.json").read_text().strip() == "[]"


# ── /chat ────────────────────────────────────────────────────────────────────

def test_analysis_not_found_404_on_chat(client):
    envelope(client.post("/chat", json={"session_key": 424247, "question": "why?"}), 404, "ANALYSIS_NOT_FOUND")


def test_analysis_failed_500_on_corrupt_cache(client, monkeypatch):
    monkeypatch.setattr(cache, "get_analysis", lambda key: {"not": "an analysis"})
    err = envelope(client.post("/chat", json={"session_key": 9539, "question": "why?"}), 500, "ANALYSIS_FAILED")
    assert "schema" in err["message"]


# ── /races ───────────────────────────────────────────────────────────────────

def test_races_openf1_error_503(client, monkeypatch, fake_openf1):
    monkeypatch.setattr(cache, "get_meetings", lambda year: None)
    fake_openf1(lambda req: httpx.Response(502, text="bad gateway"))
    err = envelope(client.get("/races?year=1999"), 503, "OPENF1_ERROR")
    assert err["details"] == {"endpoint": "meetings", "upstream_status": 502}


def test_races_openf1_rate_limit_429(client, monkeypatch, fake_openf1):
    monkeypatch.setattr(cache, "get_meetings", lambda year: None)
    fake_openf1(lambda req: httpx.Response(429, json=[]))
    envelope(client.get("/races?year=1999"), 429, "OPENF1_RATE_LIMIT")


def test_sessions_session_not_cached_404(client, monkeypatch, fake_openf1, tmp_path):
    monkeypatch.setattr(settings, "cache_dir", str(tmp_path))   # no meta/analysis dirs to fall back on
    fake_openf1(lambda req: httpx.Response(401, json={"detail": "auth"}))
    err = envelope(client.get("/races/999999/sessions"), 404, "SESSION_NOT_CACHED")
    assert err["details"] == {"meeting_key": 999999}


# ── /telemetry ───────────────────────────────────────────────────────────────

def test_telemetry_race_only_400(client, monkeypatch):
    monkeypatch.setattr(cache, "get", lambda key, endpoint: None)
    monkeypatch.setattr(cache, "get_session_meta", lambda key: {"session_name": "Qualifying"})
    err = envelope(client.get("/telemetry/9539?drivers=ZZZ,YYY"), 400, "TELEMETRY_RACE_ONLY")
    assert err["details"] == {"session_name": "Qualifying"}


def test_telemetry_not_precomputed_503_in_production(client, monkeypatch):
    monkeypatch.setattr(cache, "get", lambda key, endpoint: None)
    monkeypatch.setattr(settings, "environment", "production")
    err = envelope(client.get("/telemetry/9539?drivers=ZZZ,YYY"), 503, "TELEMETRY_NOT_PRECOMPUTED")
    assert err["details"]["drivers"] == ["ZZZ", "YYY"]


def test_telemetry_analysis_not_found_404(client, monkeypatch):
    monkeypatch.setattr(cache, "get", lambda key, endpoint: None)
    monkeypatch.setattr(cache, "get_session_meta", lambda key: None)
    monkeypatch.setattr(cache, "get_full_analysis", lambda key: None)
    envelope(client.get("/telemetry/424248?drivers=ZZZ,YYY"), 404, "ANALYSIS_NOT_FOUND")


def test_telemetry_unavailable_404(client, monkeypatch):
    from app.services import telemetry_service

    async def none(*args, **kwargs):
        return None

    monkeypatch.setattr(cache, "get", lambda key, endpoint: None)
    monkeypatch.setattr(telemetry_service, "load_telemetry", none)
    monkeypatch.setattr(telemetry_service, "load_openf1_race_telemetry", none)
    err = envelope(client.get("/telemetry/9539?drivers=ZZZ,YYY"), 404, "TELEMETRY_UNAVAILABLE")
    assert err["details"]["drivers"] == ["ZZZ", "YYY"]
