"""
/races and /races/{meeting_key}/sessions carry location and is_cancelled.

Added for the season grid (Block 26d), additively: every field the frontend
already reads is still there. is_cancelled is read strictly — only the boolean
True from OpenF1 counts, a missing field is "not cancelled" — and
excluded_sessions.json overrides OpenF1 in one direction only: what it lists
is cancelled, whatever the flag says.
"""
from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.clients import openf1_client
from app.core import cache
from app.main import app
from app.services.autopublish import EXCLUSIONS_FILE, excluded_meetings

OLD_FIELDS = {"meeting_key", "meeting_name", "country_name", "circuit_short_name", "date_start", "year"}


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def store(monkeypatch):
    """The meetings/sessions caches as an in-memory dict, so no test touches
    backend/cache/."""
    data: dict = {}
    monkeypatch.setattr(cache, "get_meetings", lambda y: data.get(("m", y)))
    monkeypatch.setattr(cache, "set_meetings", lambda y, rows: data.__setitem__(("m", y), rows))
    monkeypatch.setattr(cache, "get_sessions_for_meeting", lambda k: data.get(("s", k)))
    monkeypatch.setattr(cache, "set_sessions_for_meeting", lambda k, rows: data.__setitem__(("s", k), rows))
    return data


@pytest.fixture
def openf1(monkeypatch):
    """Install a handler for OpenF1; returns the list of requested paths."""
    monkeypatch.setattr(openf1_client, "_BACKOFF", [0, 0, 0, 0])
    real = httpx.AsyncClient
    calls: list[str] = []

    def install(handler):
        def counted(request: httpx.Request) -> httpx.Response:
            calls.append(request.url.path)
            return handler(request)

        class Patched(real):
            def __init__(self, *args, **kwargs):
                kwargs["transport"] = httpx.MockTransport(counted)
                super().__init__(*args, **kwargs)
        monkeypatch.setattr(httpx, "AsyncClient", Patched)
        return calls

    return install


def meeting(key, name, location, **extra):
    return {
        "meeting_key": key, "meeting_name": name, "country_name": "X",
        "circuit_short_name": location, "location": location,
        "date_start": f"2026-0{key % 9 + 1}-01T12:00:00+00:00", "year": 2026, **extra,
    }


MEETINGS = [
    meeting(1281, "Australian Grand Prix", "Melbourne", is_cancelled=False),
    meeting(1282, "Bahrain Grand Prix", "Sakhir", is_cancelled=True),
    # Jeddah without the flag at all: excluded_sessions.json names the meeting.
    meeting(1283, "Saudi Arabian Grand Prix", "Jeddah"),
    meeting(1308, "Bahrain Grand Prix", "Kuala Lumpur", is_cancelled="true"),
    meeting(1309, "Japanese Grand Prix", "Suzuka", is_cancelled=1),
]


def by_key(rows):
    return {r["meeting_key"]: r for r in rows}


def test_races_carry_location_and_a_strict_is_cancelled(client, store, openf1):
    openf1(lambda r: httpx.Response(200, json=MEETINGS))
    r = client.get("/races?year=2026")
    assert r.status_code == 200
    rows = by_key(r.json())
    assert rows[1282]["is_cancelled"] is True       # OpenF1 says True
    assert rows[1283]["is_cancelled"] is True       # excluded_sessions.json says so
    assert rows[1281]["is_cancelled"] is False
    assert rows[1308]["is_cancelled"] is False      # the string "true" is not True
    assert rows[1309]["is_cancelled"] is False      # neither is 1
    assert rows[1308]["location"] == "Kuala Lumpur"
    assert rows[1308]["meeting_name"] == "Bahrain Grand Prix"


def test_races_stay_additive(client, store, openf1):
    openf1(lambda r: httpx.Response(200, json=MEETINGS))
    for row in client.get("/races?year=2026").json():
        assert OLD_FIELDS <= set(row)


def test_a_cached_list_with_the_fields_is_served_without_openf1(client, store, openf1):
    store[("m", 2026)] = [{**m, "is_cancelled": m.get("is_cancelled") is True} for m in MEETINGS]
    calls = openf1(lambda r: httpx.Response(500))
    r = client.get("/races?year=2026")
    assert r.status_code == 200 and calls == []
    assert by_key(r.json())[1283]["is_cancelled"] is True  # exclusions apply to the cache too


def test_a_cached_list_from_before_the_fields_is_refreshed_once(client, store, openf1):
    store[("m", 2026)] = [{k: v for k, v in m.items() if k not in ("location", "is_cancelled")} for m in MEETINGS]
    calls = openf1(lambda r: httpx.Response(200, json=MEETINGS))
    assert by_key(client.get("/races?year=2026").json())[1282]["is_cancelled"] is True
    assert all("is_cancelled" in m for m in store[("m", 2026)])
    client.get("/races?year=2026")
    # Refreshed once: one meetings request, plus (block 43) the one sessions
    # request for the weekends' end; the second visit is served from the cache.
    assert sorted(c.rsplit("/", 1)[-1] for c in calls) == ["meetings", "sessions"]


def test_a_stale_cache_is_still_served_when_openf1_is_down(client, store, openf1):
    store[("m", 2026)] = [{k: v for k, v in m.items() if k not in ("location", "is_cancelled")} for m in MEETINGS]
    openf1(lambda r: httpx.Response(503))
    r = client.get("/races?year=2026")
    assert r.status_code == 200
    rows = by_key(r.json())
    assert rows[1281]["location"] is None and rows[1281]["is_cancelled"] is False
    assert rows[1282]["is_cancelled"] is True and rows[1283]["is_cancelled"] is True


SESSIONS = [
    {"session_key": 11262, "session_name": "Practice 1", "session_type": "Practice",
     "date_start": "2026-04-17T13:30:00+00:00", "location": "Jeddah", "is_cancelled": True},
    {"session_key": 11265, "session_name": "Qualifying", "session_type": "Qualifying",
     "date_start": "2026-04-18T17:00:00+00:00", "location": "Jeddah"},
    {"session_key": 11269, "session_name": "Race", "session_type": "Race",
     "date_start": "2026-04-19T17:00:00+00:00", "location": "Jeddah"},
]


def test_sessions_carry_location_and_is_cancelled(client, store, openf1):
    openf1(lambda r: httpx.Response(200, json=SESSIONS))
    r = client.get("/races/1283/sessions")
    assert r.status_code == 200
    rows = {s["session_key"]: s for s in r.json()}
    assert rows[11262]["is_cancelled"] is True   # OpenF1 flag
    assert rows[11265]["is_cancelled"] is False  # absent = not cancelled
    assert rows[11269]["is_cancelled"] is True   # excluded_sessions.json
    assert rows[11269]["location"] == "Jeddah"
    for s in rows.values():
        assert {"session_key", "session_name", "session_type", "date_start", "date_end"} <= set(s)


def test_stale_cached_sessions_survive_an_openf1_failure(client, store, openf1):
    store[("s", 1283)] = [{k: v for k, v in s.items() if k not in ("location", "is_cancelled")} for s in SESSIONS]
    openf1(lambda r: httpx.Response(401))
    r = client.get("/races/1283/sessions")
    assert r.status_code == 200
    assert {s["session_key"]: s["is_cancelled"] for s in r.json()} == {11262: False, 11265: False, 11269: True}


def test_the_exclusion_file_marks_sakhir_and_jeddah_as_whole_meetings():
    path = Path(__file__).resolve().parents[1] / EXCLUSIONS_FILE
    assert excluded_meetings(json.loads(path.read_text())) == {1282, 1283}


def test_meeting_exclusions_ignore_rows_without_an_integer_meeting_key():
    assert excluded_meetings({"excluded": [
        {"session_key": 1, "meeting_key": 10},
        {"session_key": 2, "meeting_key": "11"},
        {"session_key": 3},
    ]}) == {10}
    assert excluded_meetings(None) == set()


def test_committed_caches_carry_the_fields():
    """The versioned lists in backend/cache/ were backfilled, so serving them
    never triggers a refresh that rewrites a tracked file."""
    root = Path(__file__).resolve().parents[1] / "cache"
    files = sorted(root.glob("meetings_*.json")) + sorted(root.glob("meeting_*_sessions.json"))
    assert files
    for f in files:
        rows = json.loads(f.read_text())
        assert all("is_cancelled" in r and "location" in r for r in rows), f.name
