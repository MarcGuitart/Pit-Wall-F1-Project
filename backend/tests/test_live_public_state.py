"""
GET /live/state on the live server — Block 29.

The landing's live card may know whether a session is on air and which one,
nothing else: no times, positions, drivers or counts (those are the PRO
stream's). NOT TO BE MERGED BEFORE MONDAY 26 OCTOBER: it touches
scripts/live_server.py, which redeploys the live server.
"""
from __future__ import annotations

import importlib.util
import json
import sys
import time
from pathlib import Path

from starlette.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "scripts"))
if "live_server" in sys.modules:
    live_server = sys.modules["live_server"]
else:
    spec = importlib.util.spec_from_file_location("live_server", BACKEND / "scripts" / "live_server.py")
    live_server = importlib.util.module_from_spec(spec)
    sys.modules["live_server"] = live_server
    spec.loader.exec_module(live_server)

from live_state import RaceState  # noqa: E402


def racing_state(recv: float) -> RaceState:
    s = RaceState(session_key=11377)
    s.ingest("v1/drivers", {"driver_number": 1, "name_acronym": "VER", "team_name": "Red Bull Racing", "_key": "d1"}, recv=recv)
    s.ingest("v1/position", {"driver_number": 1, "position": 1, "_key": "p1"}, recv=recv)
    s.ingest("v1/laps", {"driver_number": 1, "lap_number": 12, "lap_duration": 92.5, "_key": "l1"}, recv=recv)
    return s


def get(state: RaceState):
    return TestClient(live_server.build_app(state, live_server.Hub(), None)).get("/live/state")


def test_nothing_running_is_no_session():
    r = get(RaceState())
    assert r.status_code == 200
    assert r.json() == {"state": "no_session", "session_key": None}


def test_fresh_messages_are_live_with_the_key_only():
    r = get(racing_state(time.time()))
    assert r.json() == {"state": "live", "session_key": 11377}


def test_a_feed_quiet_for_three_minutes_is_not_live():
    assert get(racing_state(time.time() - live_server.LIVE_FRESH_S - 1)).json()["state"] == "no_session"


def test_after_the_chequered_flag_it_is_not_live():
    s = racing_state(time.time())
    s.chequered = True
    assert get(s).json() == {"state": "no_session", "session_key": None}


def test_no_session_content_leaks():
    """Public, no token — and nothing but the two fields."""
    r = get(racing_state(time.time()))
    body = r.json()
    assert set(body) == {"state", "session_key"}
    text = json.dumps(body)
    for leak in ("VER", "Red Bull", "92.5", "lap", "position", "driver", "interval", "messages"):
        assert leak not in text, leak
    assert r.headers.get("cache-control") == "no-store"


def test_public_and_cors_open_to_the_site():
    s = racing_state(time.time())
    c = TestClient(live_server.build_app(s, live_server.Hub(), None))
    r = c.get("/live/state", headers={"Origin": "https://pitwallengineer.com"})
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == "https://pitwallengineer.com"
