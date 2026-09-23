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
from app.services.pit_service import SLOW_MARGIN_S, compute_pit_impact_with_cycles, is_slow_stop, lane_baseline, slow_lane_threshold
from app.services.notes_service import _undercut_notes
from app.services.timeline_builder import build_race_timeline
from app.services.notes_service import _pit_notes


@pytest.fixture
def bra(session_data):
    return session_data(9636)


@pytest.fixture
def rows_and_cycles(bra):
    tl = build_race_timeline(bra["laps"], bra["weather"], bra["race_control"], bra["pit"], bra["intervals"], bra["position"], 9636)
    return compute_pit_impact_with_cycles(bra["pit"], bra["position"], bra["laps"], bra["drivers"], bra["race_control"], tl)


@pytest.fixture
def rows(rows_and_cycles):
    return rows_and_cycles[0]


@pytest.fixture
def cycles(rows_and_cycles):
    return rows_and_cycles[1]


def test_rus_lap_28_stop_is_a_minus_four(rows):
    rus = next(r for r in rows if r.driver_code == "RUS" and r.lap_number == 28)
    assert rus.stop_duration is None                  # the field v1 filtered on
    assert rus.lane_duration == pytest.approx(25.6, abs=0.1)
    assert (rus.position_before, rus.position_after, rus.net_position_change) == (1, 5, -4)


# ── stop typing by timestamp ─────────────────────────────────────────────────

def test_rus_stopped_after_the_vsc_ended_so_it_is_a_racing_stop(rows):
    """VSC 16:28:21–16:29:50 on lap 28; RUS pitted at 16:30:26 — same lap, after the VSC."""
    rus = next(r for r in rows if r.driver_code == "RUS" and r.lap_number == 28)
    assert rus.stop_type == "racing"
    assert rus.verdict.startswith("Standard stop (25.6s lane") and "race baseline" in rus.verdict
    assert "Net: -4 positions lost" in rus.verdict
    assert rus.confidence == "High"


def test_ham_stopped_inside_the_vsc(rows):
    """HAM pitted at 16:29:21, inside the VSC window — that is the 'undercut' on RUS."""
    ham = next(r for r in rows if r.driver_code == "HAM" and r.lap_number == 27)
    assert ham.stop_type == "safety_car"
    assert "Under SC/VSC" in ham.verdict


def test_lap_28_stops_after_the_vsc_ending_message_are_racing(rows):
    after = {r.driver_code for r in rows if r.lap_number == 28}
    assert after == {"RUS", "NOR", "TSU", "LAW", "ZHO"}
    assert all(r.stop_type == "racing" for r in rows if r.lap_number == 28)


# ── pit cycles ───────────────────────────────────────────────────────────────

def test_9636_has_one_pit_cycle_before_the_red_flag(cycles):
    assert len(cycles) == 1
    c = cycles[0]
    assert (c.lap_start, c.lap_end, c.close_lap) == (24, 30, 32)
    assert c.stops == 18 and c.neutralised


def test_cycle_participants_include_non_stoppers(cycles):
    c = cycles[0]
    stopped = {p.driver_code for p in c.participants if p.stopped}
    not_stopped = {p.driver_code for p in c.participants if not p.stopped}
    assert "RUS" in stopped and "VER" in not_stopped      # VER did not stop before the red flag
    ver = next(p for p in c.participants if p.driver_code == "VER")
    assert ver.delta == 4                                  # gained through others' stops
    rus = next(p for p in c.participants if p.driver_code == "RUS")
    assert rus.delta == -4


def test_stop_rows_carry_their_cycle_and_are_read_at_its_close(rows, cycles):
    for r in rows:
        if r.stop_type == "red_flag":
            assert r.cycle_id is None
        else:
            assert r.cycle_id == 1


def test_undercuts_are_between_close_rivals_only(cycles):
    pairs = {(u.attacker, u.target) for u in cycles[0].undercuts}
    assert ("HAM", "RUS") not in pairs                     # P11 vs P1 was never an undercut
    assert pairs == {("ALO", "LAW"), ("PIA", "LAW")}


def test_one_undercut_note_per_attacker_per_cycle(cycles):
    notes = _undercut_notes(cycles)
    titles = [n.title for n in notes]
    assert titles == ["ALO undercut LAW", "PIA undercut LAW"]
    assert all(n.type == "UNDERCUT" for n in notes)
    assert len({(n.title.split()[0], n.lap_number) for n in notes}) == len(notes)


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


def test_slow_stops_are_judged_against_the_race_baseline(rows):
    thr = slow_lane_threshold(rows)
    base = lane_baseline(rows)
    assert base is not None and thr == base + SLOW_MARGIN_S
    assert 24.5 <= base <= 26.5                       # São Paulo's own pit lane, not a fixed number
    slow = [r for r in rows if is_slow_stop(r, thr)]
    assert all(r.stop_type != "red_flag" and r.lane_duration > thr for r in slow)
    # 1 400 s red-flag holds never count; PIA 26.05 s / PER 26.6 s are within the
    # baseline margin here, HUL 59.0 s and BEA 35.7 s (under VSC) are not
    assert {(r.driver_code, r.lap_number) for r in slow} == {("HUL", 27), ("BEA", 27)}


def test_race_brain_reports_two_slow_stops():
    from app.core import cache
    analysis = cache.get_full_analysis(9636)
    assert "2 slow pit stops" in analysis["race_brain"]["summary"]
    assert "33 slow" not in analysis["race_brain"]["summary"]


def test_pit_notes_never_judge_red_flag_holds(rows):
    notes = _pit_notes(rows)
    assert notes, "expected at least one outlier pit note"
    laps = {(n.title.split()[0], n.lap_number) for n in notes}
    typed = {(r.driver_code, r.lap_number): r.stop_type for r in rows}
    assert all(typed[key] != "red_flag" for key in laps)


# ── cycle cut: adjacent-position group exhausted ─────────────────────────────

def _synthetic(stops: dict[int, list[int]], total_laps: int = 30, drivers: int = 20):
    """stops = {driver_number: [laps]}; every driver holds its grid position all race."""
    from datetime import datetime, timedelta, timezone
    t0 = datetime(2024, 6, 1, 13, 0, tzinfo=timezone.utc)
    laps = [
        {"driver_number": dn, "lap_number": ln, "date_start": (t0 + timedelta(seconds=(ln - 1) * 90 + dn)).isoformat(), "lap_duration": 90.0}
        for dn in range(1, drivers + 1) for ln in range(1, total_laps + 1)
    ]
    position = [{"driver_number": dn, "position": dn, "date": (t0 - timedelta(minutes=1)).isoformat()} for dn in range(1, drivers + 1)]
    pit = [
        {"driver_number": dn, "lap_number": ln, "lane_duration": 24.0, "date": (t0 + timedelta(seconds=(ln - 1) * 90 + dn + 40)).isoformat()}
        for dn, lns in stops.items() for ln in lns
    ]
    drv = [{"driver_number": dn, "name_acronym": f"D{dn:02d}"} for dn in range(1, drivers + 1)]
    return laps, position, pit, drv


def test_two_clusters_two_laps_apart_are_separate_cycles():
    """P1-P4 stop on laps 10-11, P15-P18 on laps 12-13: only a lap apart, but
    P15 is eleven places from any stopper of the first group — two cycles."""
    laps, position, pit, drv = _synthetic({1: [10], 2: [10], 3: [11], 4: [11], 15: [12], 16: [13], 17: [13], 18: [13]})
    tl = build_race_timeline(laps, [], [], pit, [], position, 0)
    rows, cycles = compute_pit_impact_with_cycles(pit, position, laps, drv, [], tl)
    assert [(c.lap_start, c.lap_end, c.stops) for c in cycles] == [(10, 11, 4), (12, 13, 4)]


def test_a_rolling_wave_through_adjacent_positions_stays_one_cycle():
    """P1..P8 stopping one per lap: each stop leaves a neighbour still due, one cycle."""
    laps, position, pit, drv = _synthetic({dn: [9 + dn] for dn in range(1, 9)})
    tl = build_race_timeline(laps, [], [], pit, [], position, 0)
    _, cycles = compute_pit_impact_with_cycles(pit, position, laps, drv, [], tl)
    assert [(c.lap_start, c.lap_end, c.stops) for c in cycles] == [(10, 17, 8)]


def test_lane_time_is_judged_under_vsc_and_delta_relativised(rows):
    bea = next(r for r in rows if r.driver_code == "BEA" and r.lap_number == 27)
    assert bea.stop_type == "safety_car"
    assert bea.verdict.startswith("Slow stop (35.7s lane")
    assert "race baseline" in bea.verdict and "neutralisation" in bea.verdict and "cheap" not in bea.verdict
    assert is_slow_stop(bea, slow_lane_threshold(rows))


def test_neutralised_stop_note_for_ham(rows, cycles):
    from app.services.notes_service import _neutralised_stop_notes
    notes = _neutralised_stop_notes(rows, cycles)
    ham = next(n for n in notes if n.title.startswith("HAM pitted under SC/VSC"))
    assert ham.lap_number == 27 and ham.type == "PIT_IMPACT"
    assert "relative gain" in ham.message and "stopped at green" in ham.message
