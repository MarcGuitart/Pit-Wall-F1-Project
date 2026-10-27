"""
/races carries date_end, the weekend's end (block 43), additively.

The season grid shows "29 Feb to 2 Mar 2024", not only the first day. OpenF1's
meetings have no end, so it comes from, in order: the meeting's own date_end
if OpenF1 ever sends one; for a fresh list, the latest date_end among the
season's sessions — one request for the whole season, never one per meeting;
for a cached list, what the local cache knows (cached session lists, published
sessions' meta), without calling OpenF1. Missing everywhere: null.
"""
from __future__ import annotations

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.clients import openf1_client
from app.core import cache
from app.core.config import settings
from app.main import app


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def store(monkeypatch, tmp_path):
    data: dict = {}
    monkeypatch.setattr(settings, "cache_dir", str(tmp_path))
    monkeypatch.setattr(cache, "get_meetings", lambda y: data.get(("m", y)))
    monkeypatch.setattr(cache, "set_meetings", lambda y, rows: data.__setitem__(("m", y), rows))
    return data, tmp_path


@pytest.fixture
def openf1(monkeypatch):
    monkeypatch.setattr(openf1_client, "_BACKOFF", [0, 0, 0, 0])
    real = httpx.AsyncClient
    calls: list[str] = []

    def install(handler):
        def counted(request):
            calls.append(request.url.path)
            return handler(request)

        class Patched(real):
            def __init__(self, *a, **kw):
                kw["transport"] = httpx.MockTransport(counted)
                super().__init__(*a, **kw)
        monkeypatch.setattr(httpx, "AsyncClient", Patched)
        return calls
    return install


MEETINGS = [
    {"meeting_key": 1229, "meeting_name": "Bahrain Grand Prix", "location": "Sakhir", "country_name": "Bahrain",
     "circuit_short_name": "Sakhir", "date_start": "2024-02-29T11:30:00+00:00", "year": 2024, "is_cancelled": False},
    {"meeting_key": 1230, "meeting_name": "Saudi Arabian Grand Prix", "location": "Jeddah", "country_name": "Saudi Arabia",
     "circuit_short_name": "Jeddah", "date_start": "2024-03-07T13:30:00+00:00", "year": 2024, "is_cancelled": False},
]
SESSIONS = [
    {"meeting_key": 1229, "session_name": "Practice 1", "date_end": "2024-02-29T12:30:00+00:00"},
    {"meeting_key": 1229, "session_name": "Race", "date_end": "2024-03-02T17:00:00+00:00"},
    {"meeting_key": 1230, "session_name": "Race", "date_end": "2024-03-09T19:00:00+00:00"},
]


def by_key(rows):
    return {r["meeting_key"]: r for r in rows}


def test_a_fresh_list_takes_the_weekend_end_from_one_season_request(client, store, openf1):
    calls = openf1(lambda r: httpx.Response(200, json=MEETINGS if r.url.path.endswith("/meetings") else SESSIONS))
    rows = by_key(client.get("/races?year=2024").json())
    assert rows[1229]["date_end"] == "2024-03-02T17:00:00+00:00"   # the race, not practice 1
    assert rows[1230]["date_end"] == "2024-03-09T19:00:00+00:00"
    assert sorted(c.rsplit("/", 1)[-1] for c in calls) == ["meetings", "sessions"]   # one each, not one per meeting


def test_the_list_is_served_when_the_sessions_request_fails(client, store, openf1):
    openf1(lambda r: httpx.Response(200, json=MEETINGS) if r.url.path.endswith("/meetings") else httpx.Response(500))
    r = client.get("/races?year=2024")
    assert r.status_code == 200
    assert all(row["date_end"] is None for row in r.json())


def test_the_meetings_own_date_end_wins(client, store, openf1):
    own = [{**MEETINGS[0], "date_end": "2024-03-03T00:00:00+00:00"}]
    openf1(lambda r: httpx.Response(200, json=own if r.url.path.endswith("/meetings") else SESSIONS))
    assert client.get("/races?year=2024").json()[0]["date_end"] == "2024-03-03T00:00:00+00:00"


def test_a_cached_list_reads_the_end_from_the_local_cache_without_openf1(client, store, openf1):
    data, root = store
    data[("m", 2024)] = [{k: v for k, v in m.items()} for m in MEETINGS]    # cached before date_end existed
    (root / "meeting_1229_sessions.json").write_text(json.dumps(SESSIONS[:2]))
    (root / "9999").mkdir()
    (root / "9999" / "_session_meta.json").write_text(json.dumps({"meeting_key": 1230, "date_end": "2024-03-09T19:00:00+00:00"}))
    calls = openf1(lambda r: httpx.Response(500))
    rows = by_key(client.get("/races?year=2024").json())
    assert calls == []
    assert rows[1229]["date_end"] == "2024-03-02T17:00:00+00:00"
    assert rows[1230]["date_end"] == "2024-03-09T19:00:00+00:00"


def test_old_fields_unchanged_and_date_end_present(client, store, openf1):
    openf1(lambda r: httpx.Response(200, json=MEETINGS if r.url.path.endswith("/meetings") else SESSIONS))
    row = client.get("/races?year=2024").json()[0]
    for k in ("meeting_key", "meeting_name", "country_name", "circuit_short_name", "date_start", "year", "location", "is_cancelled", "date_end"):
        assert k in row
