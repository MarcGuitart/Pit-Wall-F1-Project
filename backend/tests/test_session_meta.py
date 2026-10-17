"""
GET /sessions/{session_key}/meta — Block 27.

The facts a page shows before the analysis exists. Public (no PRO), never
writes to the cache, local files first and one uncached OpenF1 read otherwise.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api import session_meta as meta_api
from app.clients.openf1_client import OpenF1Error
from app.core import cache
from app.core.config import settings
from app.main import app

KL_RACE = {
    "session_key": 11999, "meeting_key": 1308, "session_name": "Race", "session_type": "Race",
    "date_start": "2026-10-04T08:00:00+00:00", "date_end": "2026-10-04T10:00:00+00:00",
    "location": "Kuala Lumpur", "country_name": "Bahrain", "circuit_short_name": "Kuala Lumpur",
    "year": 2026,
}


@pytest.fixture
def client():
    meta_api._reset_for_tests()
    yield TestClient(app, raise_server_exceptions=False)
    meta_api._reset_for_tests()


@pytest.fixture
def empty_cache(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "cache_dir", str(tmp_path))
    return tmp_path


def openf1(monkeypatch, sessions=None, meetings=None, fail=False):
    calls: list[tuple[str, dict]] = []

    async def fake_fetch(endpoint, **params):
        calls.append((endpoint, params))
        if fail:
            raise OpenF1Error(endpoint, 3, "down")
        return {"sessions": sessions or [], "meetings": meetings or []}[endpoint]

    monkeypatch.setattr(meta_api, "fetch_json", fake_fetch)
    return calls


def test_a_published_session_is_answered_from_local_files(client, monkeypatch):
    calls = openf1(monkeypatch, fail=True)
    r = client.get("/sessions/9539/meta")
    assert r.status_code == 200 and calls == []
    body = r.json()
    assert body["meeting_name"] == "Spanish Grand Prix"
    assert body["location"] == "Barcelona"
    assert (body["year"], body["session_name"]) == (2024, "Race")
    assert body["date_start"] == "2024-06-23T13:00:00+00:00"
    assert body["analysis_cached"] is True and body["is_cancelled"] is False
    assert body["earliest_at"].startswith("2024-06-23T15:")


def test_an_unseen_session_reads_openf1_once_and_writes_nothing(client, monkeypatch, empty_cache):
    calls = openf1(monkeypatch, sessions=[KL_RACE], meetings=[{"meeting_key": 1308, "meeting_name": "Bahrain Grand Prix"}])
    body = client.get("/sessions/11999/meta").json()
    assert body["location"] == "Kuala Lumpur"          # the city, not OpenF1's country
    assert body["meeting_name"] == "Bahrain Grand Prix"
    assert body["analysis_cached"] is False
    # earliest = OpenF1's date_end + the unlock buffer, the guard's own instant
    assert body["earliest_at"].startswith("2026-10-04T10:")
    assert list(empty_cache.iterdir()) == []
    client.get("/sessions/11999/meta")
    assert [c[0] for c in calls].count("sessions") == 1  # memoised


def test_no_pro_needed_for_a_pro_season(client, monkeypatch, empty_cache):
    openf1(monkeypatch, sessions=[KL_RACE], meetings=[{"meeting_name": "Bahrain Grand Prix"}])
    assert client.get("/sessions/11999/meta").status_code == 200


def test_the_meeting_name_comes_from_the_cached_calendar_when_there(client, monkeypatch, empty_cache):
    monkeypatch.setattr(cache, "get_meetings", lambda y: [{"meeting_key": 1308, "meeting_name": "Bahrain Grand Prix", "location": "Kuala Lumpur"}])
    calls = openf1(monkeypatch, sessions=[{**KL_RACE, "location": None}])
    body = client.get("/sessions/11999/meta").json()
    assert body["meeting_name"] == "Bahrain Grand Prix" and body["location"] == "Kuala Lumpur"
    assert [c[0] for c in calls] == ["sessions"]


@pytest.mark.parametrize("flag,expected", [(True, True), ("true", False), (None, False)])
def test_cancelled_is_read_strictly(client, monkeypatch, empty_cache, flag, expected):
    openf1(monkeypatch, sessions=[{**KL_RACE, "is_cancelled": flag}], meetings=[{"meeting_name": "X"}])
    assert client.get("/sessions/11999/meta").json()["is_cancelled"] is expected


def test_the_exclusion_file_cancels_too(client, monkeypatch, empty_cache):
    openf1(monkeypatch, sessions=[{**KL_RACE, "session_key": 11269, "location": "Jeddah"}], meetings=[{"meeting_name": "Saudi Arabian Grand Prix"}])
    assert client.get("/sessions/11269/meta").json()["is_cancelled"] is True


def test_an_unknown_session_is_not_found(client, monkeypatch, empty_cache):
    openf1(monkeypatch, sessions=[])
    r = client.get("/sessions/424242/meta")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "SESSION_NOT_FOUND"


def test_openf1_down_is_a_503_not_a_404(client, monkeypatch, empty_cache):
    openf1(monkeypatch, fail=True)
    r = client.get("/sessions/11999/meta")
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "OPENF1_ERROR"
