"""The live projection: a labelled model over measured laps, never a reading."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "scripts"))

from live_projection import lap_length_m, pole_projection, race_projection  # noqa: E402
from live_state import RaceState, replay_capture  # noqa: E402

CAPTURE = BACKEND / "live" / "2026-09-26_race_11377"


def test_lap_length_from_outline_in_tenths_of_a_metre():
    import math
    ring = [[27500 * math.cos(2 * math.pi * i / 400) / math.pi, 27500 * math.sin(2 * math.pi * i / 400) / math.pi]
            for i in range(400)]                       # perimeter 55 000 units
    assert lap_length_m(ring) == pytest.approx(5500, rel=0.01)
    assert lap_length_m([[0, 0]] * 10) is None


def test_no_projection_without_a_distance():
    s = RaceState()
    s.current_lap = 10
    out = race_projection(s)
    assert out["drivers"] == [] and "outline" in out["reason"]


@pytest.mark.skipif(not CAPTURE.is_dir(), reason="Baku capture not present")
def test_mid_race_projection_on_baku():
    s = RaceState()
    replay_capture(CAPTURE, s, speed=0, until_lap=30)
    s.race_distance = 51
    out = race_projection(s)
    assert out["drivers"], out.get("reason")
    total = sum(d["win"] for d in out["drivers"])
    assert total == pytest.approx(1.0, abs=0.01)
    top = out["drivers"][0]
    assert top["position"] <= 4                 # the favourite is near the front, not a backmarker
    assert all(1 <= d["projected_position"] <= len(out["drivers"]) for d in out["drivers"])


def test_pole_odds_favour_the_room_on_the_ideal_lap():
    s = RaceState()
    rows = [
        {"driver_number": 1, "code": "A", "position": 1, "best_lap_s": 90.0, "ideal_lap": {"total": 90.0}},
        {"driver_number": 2, "code": "B", "position": 2, "best_lap_s": 90.05, "ideal_lap": {"total": 89.5}},
        {"driver_number": 3, "code": "C", "position": 3, "best_lap_s": 92.0, "ideal_lap": {"total": 91.9}},
    ]
    out = pole_projection(s, rows)
    odds = {d["code"]: d["win"] for d in out["drivers"]}
    assert odds["B"] > odds["A"] and odds["C"] == 0
