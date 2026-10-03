"""
The live dashboard block: car telemetry, the drawn circuit outline, race
control, record progression — and the session rollover that keeps a weekend's
sessions from being computed on top of each other.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "scripts"))

from live_state import CAR_HISTORY, FLAG_SC, RaceState, dashboard, replay_capture  # noqa: E402

CAPTURE = BACKEND / "live" / "2026-09-26_race_11377"


def lap(state: RaceState, dn: int, ln: int, dur: float | None = None, t: float = 0.0, out: bool = False):
    state.ingest("v1/laps", {"_key": f"{dn}-{ln}", "session_key": 1, "driver_number": dn,
                             "lap_number": ln, "lap_duration": dur, "is_pit_out_lap": out}, recv=t)


def drive_a_lap(state: RaceState, dn: int, ln: int, points: int = 200, t0: float = 0.0):
    lap(state, dn, ln, t=t0)
    for i in range(points):
        a = 2 * math.pi * i / points
        state.ingest("v1/location", {"session_key": 1, "driver_number": dn,
                                     "x": 1000 * math.cos(a), "y": 600 * math.sin(a), "z": 0},
                     recv=t0 + i * 0.27)


def test_car_data_keeps_latest_and_a_bounded_history():
    s = RaceState()
    for i in range(CAR_HISTORY + 20):
        s.ingest("v1/car_data", {"session_key": 1, "driver_number": 44, "speed": 100 + i, "rpm": 11000,
                                 "n_gear": 7, "throttle": 99, "brake": 0, "drs": 12}, recv=float(i))
    d = dashboard(s)
    car = next(c for c in d["cars"] if c["driver_number"] == 44)
    assert car["speed"] == 100 + CAR_HISTORY + 19 and car["gear"] == 7
    assert len(d["car_history"]["44"]) == CAR_HISTORY
    # never in the per-topic store — that is the memory budget
    assert "v1/car_data" not in s.store
    assert s.counts["v1/car_data"] == CAR_HISTORY + 20


def test_outline_is_one_complete_clean_lap():
    s = RaceState()
    lap(s, 16, 1, t=0.0, out=True)                     # an out-lap is never the outline
    drive_a_lap(s, 16, 2, t0=10.0)
    assert s.track_outline is None                     # lap 2 was traced, but not finished yet
    lap(s, 16, 3, t=100.0)
    s.ingest("v1/location", {"session_key": 1, "driver_number": 16, "x": 1000, "y": 0}, recv=100.1)
    assert s.track_outline is not None and 150 <= len(s.track_outline) <= 400
    assert dashboard(s)["track"]["bounds"] == pytest.approx([-1000, -600, 1000, 600], abs=20)


def test_no_outline_from_a_lap_under_safety_car():
    s = RaceState()
    drive_a_lap(s, 1, 2)
    s.flag = FLAG_SC
    lap(s, 1, 3, t=100.0)
    s.ingest("v1/location", {"session_key": 1, "driver_number": 1, "x": 5, "y": 5}, recv=100.1)
    assert s.track_outline is None


def test_zero_zero_is_no_fix():
    s = RaceState()
    s.ingest("v1/location", {"session_key": 1, "driver_number": 1, "x": 0, "y": 0}, recv=1.0)
    assert s.loc == {} and s.loc_bounds is None


def test_record_progression_in_completion_order():
    s = RaceState()
    lap(s, 1, 2, 92.0, t=10)
    lap(s, 2, 2, 91.5, t=11)
    lap(s, 1, 3, 91.8, t=12)       # a personal best, not a session record
    lap(s, 1, 4, 91.0, t=13)
    recs = dashboard(s)["records"]
    assert [(r["driver_number"], r["time_s"]) for r in recs] == [(1, 92.0), (2, 91.5), (1, 91.0)]
    assert recs[-1]["improvement_s"] == pytest.approx(0.5)


def test_a_new_session_key_resets_everything():
    s = RaceState()
    lap(s, 1, 5, 90.0, t=1)
    s.ingest("v1/car_data", {"session_key": 1, "driver_number": 1, "speed": 300}, recv=2)
    s.set_session_meta("Qualifying", "Qualifying", "Kuala Lumpur")
    s.ingest("v1/laps", {"_key": "x", "session_key": 2, "driver_number": 4, "lap_number": 1}, recv=3)
    assert s.session_key == 2
    assert s.lap_times.get(1) is None and s.car == {}
    assert s.session_type is None            # re-resolved by the server for the new session
    assert s.current_lap == 1
    # a straggler from the session that ended is dropped, not mixed in
    s.ingest("v1/laps", {"_key": "y", "session_key": 1, "driver_number": 1, "lap_number": 9, "lap_duration": 80.0}, recv=4)
    assert s.current_lap == 1 and 1 not in s.lap_times


@pytest.mark.skipif(not CAPTURE.is_dir(), reason="Baku capture not present locally")
def test_dashboard_on_a_real_race_serialises():
    s = RaceState()
    replay_capture(CAPTURE, s, speed=0)
    d = dashboard(s)
    json.dumps(d, default=str)
    assert d["race_control"] and d["stints"] and d["records"]
    assert d["weather"]["air_temperature"] is not None
    snap = s.snapshot(include_analysis=True)
    assert "error" not in snap["dashboard"]
