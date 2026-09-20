"""
Pit impact on 9636 (São Paulo 2024): lane_duration is the metric, stop types
come from the timeline, and red-flag holds are never 'slow stops'.
"""
from __future__ import annotations

import json
from collections import Counter

import pytest

from app.domain.models import FullRaceAnalysis
from app.services.chat_service import build_chat_context
from app.services.pit_service import SLOW_LANE_S, compute_pit_impact, is_slow_stop
from app.services.timeline_builder import build_race_timeline
from app.services.notes_service import _pit_notes


@pytest.fixture
def bra(session_data):
    return session_data(9636)


@pytest.fixture
def rows(bra):
    tl = build_race_timeline(bra["laps"], bra["weather"], bra["race_control"], bra["pit"], bra["intervals"], bra["position"], 9636)
    return compute_pit_impact(bra["pit"], bra["position"], bra["laps"], bra["drivers"], tl)


def test_rus_lap_28_stop_is_a_minus_four(rows):
    rus = next(r for r in rows if r.driver_code == "RUS" and r.lap_number == 28)
    assert rus.stop_duration is None                  # the field v1 filtered on
    assert rus.lane_duration == pytest.approx(25.6, abs=0.1)
    assert (rus.position_before, rus.position_after, rus.net_position_change) == (1, 5, -4)


def test_rus_appears_in_chat_pit_losers(rows, bra):
    """The chat context used to hide RUS because stop_duration was None."""
    from app.core import cache
    analysis = FullRaceAnalysis.model_validate(cache.get_full_analysis(9636))
    ctx = json.loads(build_chat_context(analysis))
    losers = {(p["driver"], p["lap"]): p["delta"] for p in ctx["pit_losers"]}
    assert losers[("RUS", 28)] == -4
    assert all(d < 0 for d in losers.values())


def test_red_flag_stops_are_their_own_category(rows):
    types = Counter(r.stop_type for r in rows)
    assert types["red_flag"] == 17          # the lap-32 suspension, incl. ZHO logged on lap 31 with a 1 283 s lane time
    for r in rows:
        if r.lane_duration and r.lane_duration > 300:
            assert r.stop_type == "red_flag", (r.driver_code, r.lap_number, r.lane_duration)
            assert "Slow stop" not in r.verdict
            assert r.confidence == "Low"


def test_slow_stops_exclude_red_flag_and_sc(rows):
    slow = [r for r in rows if is_slow_stop(r)]
    assert all(r.stop_type == "racing" and r.lane_duration > SLOW_LANE_S for r in slow)
    assert len(slow) == 4                   # was 33 when the 1 400 s holds counted


def test_race_brain_reports_four_slow_stops():
    from app.core import cache
    analysis = cache.get_full_analysis(9636)
    assert "4 slow pit stops" in analysis["race_brain"]["summary"]
    assert "33 slow" not in analysis["race_brain"]["summary"]


def test_pit_notes_only_judge_racing_stops(rows):
    notes = _pit_notes(rows)
    assert notes, "expected at least one outlier pit note"
    laps = {(n.title.split()[0], n.lap_number) for n in notes}
    typed = {(r.driver_code, r.lap_number): r.stop_type for r in rows}
    assert all(typed[key] == "racing" for key in laps)
