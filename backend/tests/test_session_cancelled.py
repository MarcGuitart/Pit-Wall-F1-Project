"""
/analysis answers SESSION_CANCELLED (410) for a cancelled session — Block 27.

Same reading as /races: excluded_sessions.json, or OpenF1's is_cancelled
read strictly (only the boolean True). Checked before the PRO gate — that a
session did not take place is the answer for every reader — and without
computing, fetching laps or writing anything to the cache.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.api import analysis as analysis_api
from app.core.config import settings
from app.main import app


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "cache_dir", str(tmp_path))
    monkeypatch.setattr(settings, "pro_access_codes", ["cancelled-test-code"])
    monkeypatch.setattr(settings, "pro_token_secret", SecretStr("cancelled-test-secret"))

    async def no_compute(*args, **kwargs):
        raise AssertionError("a cancelled session must not be computed")

    monkeypatch.setattr(analysis_api, "load_session", no_compute)
    monkeypatch.setattr(analysis_api, "_fetch_session_meta", no_compute)
    return TestClient(app, raise_server_exceptions=False)


def openf1_session(monkeypatch, **row):
    calls = []

    async def fake_fetch(endpoint, **params):
        calls.append(endpoint)
        assert endpoint == "sessions", endpoint
        return [{"session_key": params.get("session_key"), "year": 2026, "session_type": "Race",
                 "session_name": "Race", "date_start": "2026-04-19T17:00:00+00:00", **row}]

    monkeypatch.setattr(analysis_api, "fetch_json", fake_fetch)
    return calls


def test_a_session_in_the_exclusion_file_is_cancelled_without_the_network(client, monkeypatch, tmp_path):
    calls = openf1_session(monkeypatch)              # no flag at all from OpenF1
    r = client.get("/analysis/11269")                # Jeddah 2026 · Race
    assert r.status_code == 410
    err = r.json()["error"]
    assert err["code"] == "SESSION_CANCELLED"
    assert err["details"] == {"session_key": 11269, "source": "excluded_sessions.json"}
    assert list(tmp_path.iterdir()) == []            # nothing cached for it


def test_openf1s_flag_cancels_a_session_the_file_does_not_list(client, monkeypatch, tmp_path):
    openf1_session(monkeypatch, is_cancelled=True)
    r = client.get("/analysis/11262")                # Jeddah 2026 · Practice 1
    assert r.status_code == 410
    assert r.json()["error"]["details"]["source"] == "openf1"
    assert list(tmp_path.iterdir()) == []


def test_cancelled_is_answered_before_the_pro_gate(client, monkeypatch):
    """2026 is a PRO season and there is no token: still 410, not 402."""
    openf1_session(monkeypatch, is_cancelled=True)
    assert client.get("/analysis/11262").json()["error"]["code"] == "SESSION_CANCELLED"


@pytest.mark.parametrize("flag", ["true", 1, None, False])
def test_only_the_boolean_true_cancels(client, monkeypatch, flag):
    """Anything else falls through to the normal path — here, the PRO gate."""
    openf1_session(monkeypatch, is_cancelled=flag)
    r = client.get("/analysis/11265")
    assert r.status_code == 402
    assert r.json()["error"]["code"] == "PRO_REQUIRED"


def test_a_cached_meta_with_the_flag_is_enough(client, monkeypatch):
    from app.core import cache
    monkeypatch.setattr(cache, "get_session_meta", lambda k: {"session_key": k, "year": 2026, "is_cancelled": True})

    async def no_network(*a, **k):
        raise AssertionError("the cached meta answers it")

    monkeypatch.setattr(analysis_api, "fetch_json", no_network)
    assert client.get("/analysis/11264").status_code == 410


def test_a_published_session_is_never_reported_cancelled():
    assert analysis_api._cancelled_source(9539, {}) is None
    assert analysis_api._cancelled_source(9539, {"is_cancelled": False}) is None
