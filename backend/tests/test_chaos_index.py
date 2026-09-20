"""
Chaos Index method 2.0.

Cached sessions: the calibration constraints from the redesign —
9636 stays Extreme, 9566 is the lowest, the five spread across the bands
(no band holds more than two), and no component saturates in more than one.

Synthetic: a 44-lap and a 78-lap race with the same *pattern* of incidents
(same fractions) must score the same — v1 counted events and could not.
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone

import pytest

from app.services.chaos_service import (
    FULL_SCALE, METHOD_VERSION, THRESHOLDS, WEIGHTS,
    compute_chaos_index, count_stewarding, level_for, stewarding_per_lap,
)
from app.services.timeline_builder import build_race_timeline

SESSIONS = (9566, 9197, 9539, 9662, 9636)


def _chaos(key: int, d: dict):
    tl = build_race_timeline(d["laps"], d["weather"], d["race_control"], d["pit"], d["intervals"], d["position"], key)
    return compute_chaos_index(tl, d["race_control"], d["laps"], d["position"], d["pit"])


@pytest.fixture
def scores(session_data):
    return {k: _chaos(k, session_data(k)) for k in SESSIONS}


# ── Structure ────────────────────────────────────────────────────────────────

def test_weights_sum_to_100():
    assert sum(WEIGHTS.values()) == 100
    assert set(WEIGHTS) == set(FULL_SCALE)


def test_levels_are_contiguous_and_ordered():
    floors = [f for f, _ in THRESHOLDS]
    assert floors == sorted(floors, reverse=True) and floors[-1] == 0
    assert level_for(0) == "Low" and level_for(100) == "Extreme"
    assert level_for(THRESHOLDS[0][0]) == "Extreme"
    assert level_for(THRESHOLDS[0][0] - 1) == "High"


def test_breakdown_is_auditable(scores):
    for chaos in scores.values():
        assert chaos.method_version == METHOD_VERSION
        assert set(chaos.breakdown) == set(WEIGHTS)
        total = 0.0
        for name, c in chaos.breakdown.items():
            assert 0.0 <= c.normalized <= 1.0
            assert c.weight == WEIGHTS[name] and c.full_scale == FULL_SCALE[name]
            assert c.points == pytest.approx(c.normalized * c.weight, abs=0.06)
            assert getattr(chaos.components, name) == round(c.points)
            total += c.points
        assert chaos.score == min(100, round(total))
        assert chaos.level == level_for(chaos.score)


# ── Calibration constraints ──────────────────────────────────────────────────

def test_9636_is_extreme(scores):
    assert scores[9636].level == "Extreme"


def test_9566_is_the_lowest(scores):
    assert scores[9566].score == min(c.score for c in scores.values())
    assert scores[9566].level == "Low"


def test_sessions_spread_across_bands(scores):
    per_band = Counter(c.level for c in scores.values())
    assert max(per_band.values()) <= 2, per_band
    assert len(per_band) >= 3


def test_no_component_saturates_in_more_than_one_session(scores):
    for name in WEIGHTS:
        saturated = [k for k, c in scores.items() if c.breakdown[name].normalized >= 1.0]
        assert len(saturated) <= 1, (name, saturated)


def test_stewarding_counts_an_incident_once():
    rc = [
        {"message": "TURN 1 INCIDENT INVOLVING CAR 1 (VER) NOTED - CAUSING A COLLISION"},
        {"message": "FIA STEWARDS: TURN 1 INCIDENT INVOLVING CAR 1 (VER) UNDER INVESTIGATION - CAUSING A COLLISION"},
        {"message": "FIA STEWARDS: 10 SECOND TIME PENALTY FOR CAR 1 (VER) - CAUSING A COLLISION"},
        {"message": "TURN 4 INCIDENT INVOLVING CAR 4 (NOR) NOTED - TRACK LIMITS"},
        {"message": "FIA STEWARDS: TURN 4 INCIDENT INVOLVING CAR 4 (NOR) REVIEWED NO FURTHER INVESTIGATION - TRACK LIMITS"},
        {"message": "FIA STEWARDS: 10 SECOND STOP/GO PENALTY FOR CAR 30 (LAW) - UNSAFE RELEASE"},
    ]
    assert count_stewarding(rc) == (2, 2)   # v1 counted 3 'investigations' + 1 penalty here


def test_penalty_is_attributed_to_the_lap_of_its_incident():
    rc = [
        {"lap_number": 1, "date": "t1", "message": "TURN 1 INCIDENT INVOLVING CARS 1 (VER) AND 81 (PIA) NOTED - CAUSING A COLLISION"},
        {"lap_number": 4, "date": "t2", "message": "FIA STEWARDS: TURN 1 INCIDENT INVOLVING CARS 1 (VER) AND 81 (PIA) UNDER INVESTIGATION"},
        {"lap_number": 5, "date": "t3", "message": "FIA STEWARDS: 10 SECOND TIME PENALTY FOR CAR 1 (VER) - CAUSING A COLLISION"},
        {"lap_number": 58, "date": "t4", "message": "FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 18 (STR) - TRACK LIMITS"},
    ]
    assert stewarding_per_lap(rc) == {1: (1, 1), 58: (0, 1)}   # STR: no noted incident -> issue lap


def test_peak_chaos_lap_follows_the_altered_state_signals(scores):
    # Abu Dhabi 2024: lap-1 VER/PIA collision (+ penalty attributed to lap 1), not
    # the last-lap track-limits penalty and not v1's 'most messages' lap
    assert scores[9662].peak_chaos_lap == 1
    # Hungary 2024: the VER/HAM collision + yellow on lap 63
    assert scores[9566].peak_chaos_lap == 63
    # São Paulo 2024: the red flag on lap 32 — the maximum interruption wins
    assert scores[9636].peak_chaos_lap == 32
    # the other four are unaffected by the red-flag term
    assert scores[9197].peak_chaos_lap == 48
    assert scores[9539].peak_chaos_lap == 46
    for c in scores.values():
        assert c.peak_chaos_lap is not None and c.peak_chaos_lap >= 1


# ── Synthetic: same pattern, different race length ───────────────────────────

T0 = datetime(2024, 6, 1, 13, 0, tzinfo=timezone.utc)
DRIVERS = list(range(1, 21))
LAP_S = 90.0


def synthetic_race(total_laps: int):
    """
    20 drivers, no pit stops, dry. Pattern (all as fractions of the race):
    - SC from 20 % to 30 % of the distance, VSC at 60 % for one tenth
    - a local yellow every 10 laps
    - one incident noted every 10 laps, a penalty every 20 laps
    - two adjacent drivers swap places on every green lap (constant rate)
    """
    laps, rc, pos = [], [], []
    t = lambda ln, dn: T0 + timedelta(seconds=(ln - 1) * LAP_S + dn * 0.5)
    order = list(DRIVERS)
    for dn in DRIVERS:
        pos.append({"driver_number": dn, "position": dn, "date": (T0 - timedelta(minutes=5)).isoformat()})
    sc_start, sc_end = round(total_laps * 0.2), round(total_laps * 0.3)
    vsc_start, vsc_end = round(total_laps * 0.6), round(total_laps * 0.7)
    rc.append({"lap_number": sc_start, "message": "SAFETY CAR DEPLOYED", "date": t(sc_start, 0).isoformat()})
    rc.append({"lap_number": sc_end, "message": "SAFETY CAR IN THIS LAP", "date": t(sc_end, 0).isoformat()})
    rc.append({"lap_number": vsc_start, "message": "VIRTUAL SAFETY CAR DEPLOYED", "date": t(vsc_start, 0).isoformat()})
    rc.append({"lap_number": vsc_end, "message": "VIRTUAL SAFETY CAR ENDING", "date": t(vsc_end, 0).isoformat()})
    neutral = set(range(sc_start, sc_end + 2)) | set(range(vsc_start, vsc_end + 2))
    for ln in range(1, total_laps + 1):
        for dn in DRIVERS:
            laps.append({"driver_number": dn, "lap_number": ln, "date_start": t(ln, dn).isoformat(), "lap_duration": LAP_S})
        if ln % 10 == 5:
            rc.append({"lap_number": ln, "flag": "YELLOW", "message": "YELLOW IN TRACK SECTOR 3", "date": t(ln, 5).isoformat()})
        if ln % 10 == 3:
            rc.append({"lap_number": ln, "message": f"TURN 1 INCIDENT INVOLVING CAR 1 (VER) NOTED - LAP {ln}", "date": t(ln, 3).isoformat()})
        if ln % 20 == 7:
            rc.append({"lap_number": ln, "message": "FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 1 (VER) - X", "date": t(ln, 3).isoformat()})
        if ln >= 2 and ln not in neutral:
            i = ln % 18
            order[i], order[i + 1] = order[i + 1], order[i]
            for p, dn in enumerate(order, start=1):
                pos.append({"driver_number": dn, "position": p, "date": (t(ln, 0) - timedelta(seconds=1)).isoformat()})
    weather = [{"date": t(ln, 0).isoformat(), "rainfall": 0, "track_temperature": 30.0, "air_temperature": 20.0} for ln in range(1, total_laps + 1)]
    return {"laps": laps, "race_control": rc, "position": pos, "pit": [], "intervals": [], "weather": weather}


@pytest.mark.parametrize("total_laps", [44, 78])
def test_synthetic_pattern_is_length_independent(total_laps):
    d = synthetic_race(total_laps)
    chaos = _chaos(0, d)
    b = chaos.breakdown
    # ~10 % SC + ~10 % VSC·0.5, plus the deploy/ending lap granularity (one
    # extra lap per period weighs more in a short race)
    assert 0.15 <= b["safety_car"].raw <= 0.25
    assert b["yellow_flags"].raw == pytest.approx(0.10, abs=0.03)
    assert b["stewarding"].raw == pytest.approx(0.20, abs=0.04)          # 0.1 incidents + 2·0.05 penalties per lap
    assert b["weather"].raw == 0
    assert b["position_volatility"].raw == pytest.approx(2 / 20, abs=0.02)


def test_synthetic_44_and_78_lap_races_score_the_same():
    a, b = _chaos(0, synthetic_race(44)), _chaos(0, synthetic_race(78))
    # The 78-lap race has ~1.8x the incidents, penalties and yellows; v1 would
    # have scored it far higher. What is left is SC lap granularity (<= 5 pts).
    assert count_stewarding(synthetic_race(78)["race_control"])[0] > count_stewarding(synthetic_race(44)["race_control"])[0]
    assert abs(a.score - b.score) <= 5, (a.score, b.score)
    assert a.level == b.level
