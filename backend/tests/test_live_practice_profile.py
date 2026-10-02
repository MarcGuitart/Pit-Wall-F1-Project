"""
Practice/qualifying profile — Block 25.

Confirmed against real data before writing any of this (not assumed):
11727/11728 (Kuala Lumpur FP1/FP2) have sector times and segment colours,
intervals is empty (0 rows) in both, and OpenF1's own documentation states
segments are "not available during races" — so this whole panel set is
practice/qualifying-only by the nature of the data, not an arbitrary choice.
Segment codes (0 not available, 2048 yellow, 2049 green, 2051 purple, 2064
pitlane) are from OpenF1's docs directly; the sector-level purple/green/yellow
used here is computed from duration_sector_1/2/3 (session-best, personal-best)
independently of those mini-sector codes.

Raw FP1/FP2 endpoints are not committed (same policy as every other session's
raw data — see .gitignore), so the integration tests below skip if they are
not present locally; cache them with:

    python -c "..." # see the block's own report for the exact fetch used
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "scripts"))

from live_state import (  # noqa: E402
    FLAG_GREEN, FLAG_RED, FLAG_SC, FLAG_YELLOW, RaceState, live_analysis,
    long_run_pace, practice_tower, replay, replay_capture, session_timeline,
)

FP1 = BACKEND / "cache" / "11727"
FP2 = BACKEND / "cache" / "11728"
CAPTURE = BACKEND / "live" / "2026-09-26_race_11377"
needs_fp1 = pytest.mark.skipif(not (FP1 / "laps.json").exists(), reason="FP1 raw cache not present locally")
needs_fp2 = pytest.mark.skipif(not (FP2 / "laps.json").exists(), reason="FP2 raw cache not present locally")
needs_capture = pytest.mark.skipif(not CAPTURE.is_dir(), reason="the Baku capture is not in this checkout")


# ── profile selection ─────────────────────────────────────────────────────────

def test_default_profile_is_race_when_session_type_is_unknown():
    state = RaceState()
    assert state.profile == "race"


@pytest.mark.parametrize("session_type, expected", [
    ("Practice", "practice"),
    ("Qualifying", "qualifying"),
    ("Race", "race"),
    ("Sprint Qualifying", "race"),   # not a value this project has seen — fails closed to race
    (None, "race"),
])
def test_profile_follows_session_type(session_type, expected):
    state = RaceState()
    state.set_session_meta(session_type, "whatever", "whatever")
    assert state.profile == expected


def test_a_sprint_still_gets_the_race_profile():
    """OpenF1 types a Sprint session_type "Race"; session_name is "Sprint" —
    the profile must follow session_type, not session_name, since a sprint is
    a real points race with a real finishing order."""
    state = RaceState()
    state.set_session_meta("Race", "Sprint", "Shanghai")
    assert state.profile == "race"


def test_location_is_stored_separately_from_country_name():
    """The field that must be used for the GP's name — OpenF1 confirmed to
    mislabel Kuala Lumpur's country_name as "Bahrain"; set_session_meta takes
    location explicitly and never reads country_name at all."""
    state = RaceState()
    state.set_session_meta("Practice", "Practice 1", "Kuala Lumpur")
    assert state.location == "Kuala Lumpur"
    assert state.snapshot(include_analysis=False)["location"] == "Kuala Lumpur"


# ── session status (the chaos replacement) ───────────────────────────────────

def test_session_status_has_no_chaos_concept_at_all():
    state = RaceState()
    state.set_session_meta("Practice", "Practice 1", "Sakhir")
    status = state.session_status()
    assert "score" not in status and "level" not in status
    assert status["flag"] == FLAG_GREEN
    assert status["red_flags"] == 0


def test_session_status_counts_a_closed_red_flag_period():
    state = RaceState()
    state.set_session_meta("Practice", "Practice 1", "Sakhir")
    t0 = 1000.0
    state.clock = lambda: t0
    state.ingest("v1/race_control", {"flag": "RED", "message": "RED FLAG", "date": "2026-01-01T00:00:00Z"}, recv=t0)
    state.clock = lambda: t0 + 120
    state.ingest("v1/race_control", {"flag": "GREEN", "message": "TRACK CLEAR", "date": "2026-01-01T00:02:00Z"}, recv=t0 + 120)
    status = state.session_status(now=t0 + 120)
    assert status["red_flags"] == 1
    assert status["minutes_under_red"] == 2.0


def test_session_status_counts_the_still_open_red_period_too():
    state = RaceState()
    state.set_session_meta("Practice", "Practice 1", "Sakhir")
    t0 = 1000.0
    state.clock = lambda: t0
    state.ingest("v1/race_control", {"flag": "RED", "message": "RED FLAG", "date": "2026-01-01T00:00:00Z"}, recv=t0)
    status = state.session_status(now=t0 + 60)   # still red, 60s later
    assert status["red_flags"] == 1
    assert status["minutes_under_red"] == 1.0


# ── sector colours, from real data ───────────────────────────────────────────

@needs_fp1
def test_practice_tower_is_ranked_by_best_lap_not_position():
    state = RaceState()
    replay(11727, state)
    tower = practice_tower(state)
    assert tower, "FP1 cache produced no tower rows"
    times = [r["best_lap_s"] for r in tower]
    assert times == sorted(times)
    assert tower[0]["position"] == 1
    assert tower[0]["gap_to_p1"] == 0.0


@needs_fp1
def test_every_sector_colour_is_purple_green_or_yellow_or_unknown():
    state = RaceState()
    replay(11727, state)
    tower = practice_tower(state)
    seen = {s["colour"] for r in tower for s in r["sectors"].values()}
    assert seen <= {"purple", "green", "yellow", None}


@needs_fp1
def test_at_least_one_purple_sector_exists_in_a_real_session():
    """A purple sector is, by construction, the single best time anyone set in
    that sector all session — over a real ~20-car practice session there must
    be at least one, or the colouring logic itself is broken."""
    state = RaceState()
    replay(11727, state)
    tower = practice_tower(state)
    purples = [s for r in tower for s in r["sectors"].values() if s["colour"] == "purple"]
    assert purples


@needs_fp1
def test_the_session_best_sector_is_never_beaten_by_anyone_elses_time():
    state = RaceState()
    replay(11727, state)
    tower = practice_tower(state)
    for key in ("sector1", "sector2", "sector3"):
        times = [r["sectors"][key]["time"] for r in tower if r["sectors"][key]["time"] is not None]
        purple_times = [r["sectors"][key]["time"] for r in tower if r["sectors"][key]["colour"] == "purple"]
        if purple_times:
            assert min(purple_times) == min(times)


@needs_fp1
def test_ideal_lap_is_never_slower_than_the_drivers_own_best_lap():
    """The ideal lap is the sum of personal-best sectors, which can only ever
    be equal to or faster than any single lap that driver actually set."""
    state = RaceState()
    replay(11727, state)
    tower = practice_tower(state)
    for r in tower:
        if r["ideal_lap"]:
            assert r["ideal_lap"]["total"] <= r["best_lap_s"] + 0.001


# ── pace: clean laps and long runs ───────────────────────────────────────────

@needs_fp1
def test_clean_lap_pace_reuses_true_pace_but_is_not_called_true_pace():
    state = RaceState()
    replay(11727, state)
    from live_state import clean_lap_pace
    rows = clean_lap_pace(state, state.lists())
    assert rows
    for r in rows:
        assert "median_clean_lap_s" in r and "confidence" in r
        assert r["confidence"] in ("Low", "Medium", "High")


@needs_fp1
def test_long_runs_require_at_least_five_consecutive_clean_laps():
    state = RaceState()
    replay(11727, state)
    runs = long_run_pace(state)
    assert runs
    for r in runs:
        assert r["laps"] >= 5
        assert r["lap_end"] - r["lap_start"] + 1 == r["laps"], "must be consecutive, not just >=5 clean laps total"


def test_a_four_lap_run_is_not_a_long_run():
    state = RaceState()
    state.set_session_meta("Practice", "Practice 1", "Sakhir")
    for ln, t in enumerate([90.0, 89.5, 89.2, 89.8], start=1):
        state.ingest("v1/laps", {"driver_number": 1, "lap_number": ln, "lap_duration": t,
                                 "is_pit_out_lap": False}, recv=float(ln))
    assert long_run_pace(state) == []


def test_a_five_lap_run_is_a_long_run_at_low_confidence():
    state = RaceState()
    state.set_session_meta("Practice", "Practice 1", "Sakhir")
    for ln, t in enumerate([90.0, 89.5, 89.2, 89.8, 89.1], start=1):
        state.ingest("v1/laps", {"driver_number": 1, "lap_number": ln, "lap_duration": t,
                                 "is_pit_out_lap": False}, recv=float(ln))
    runs = long_run_pace(state)
    assert len(runs) == 1 and runs[0]["laps"] == 5 and runs[0]["confidence"] == "Low"


def test_two_separate_runs_pick_the_longer_one():
    """3 clean, a gap (pit), then 6 clean — only the 6 counts, and the 3 must
    not be stitched onto it across the gap."""
    state = RaceState()
    state.set_session_meta("Practice", "Practice 1", "Sakhir")
    for ln in (1, 2, 3):
        state.ingest("v1/laps", {"driver_number": 7, "lap_number": ln, "lap_duration": 90.0,
                                 "is_pit_out_lap": False}, recv=float(ln))
    state.ingest("v1/pit", {"driver_number": 7, "lap_number": 4, "date": "2026-01-01T00:00:00Z"})
    for ln in range(5, 11):
        state.ingest("v1/laps", {"driver_number": 7, "lap_number": ln, "lap_duration": 89.0,
                                 "is_pit_out_lap": (ln == 5)}, recv=float(ln))
    runs = long_run_pace(state)
    assert len(runs) == 1
    assert runs[0]["laps"] == 5          # 6, 7, 8, 9, 10 — lap 5 is the pit-out lap, excluded
    assert runs[0]["lap_start"] == 6


# ── no promotion below High confidence for a degradation-style claim ────────

def test_long_run_notes_never_claim_degradation_below_high_confidence():
    from live_state import practice_notes
    state = RaceState()
    state.set_session_meta("Practice", "Practice 1", "Sakhir")
    for ln, t in enumerate([90.0, 89.5, 89.2, 89.8, 89.1], start=1):   # 5 laps -> Low
        state.ingest("v1/laps", {"driver_number": 1, "lap_number": ln, "lap_duration": t,
                                 "is_pit_out_lap": False}, recv=float(ln))
    runs = long_run_pace(state)
    notes = practice_notes(state, [], runs)
    for n in notes:
        if n["type"] == "LONG_RUN":
            assert "degrad" not in n["message"].lower()
            assert "because" not in n["message"].lower()


# ── timeline: chronological markers, SC bands for race ──────────────────────

@needs_capture
def test_timeline_markers_are_in_true_chronological_order():
    """Regression: markers used to be built per-driver (all of driver A's
    laps, then driver B's), which could misorder "session best" improvements
    relative to when they actually happened. Sorted by `at`, every entry must
    already be non-decreasing."""
    state = RaceState()
    replay_capture(CAPTURE, state, speed=0)
    tl = session_timeline(state)
    ats = [m["at"] for m in tl["markers"] if m.get("at")]
    assert ats == sorted(ats)


@needs_capture
def test_timeline_markers_do_not_all_share_one_timestamp():
    """The exact shape of the bug: every marker dated to the last message a
    driver happened to send, rather than when that specific lap completed —
    so a driver with several session-best markers had them all collapse to
    one identical timestamp (their final message), even though each
    improvement happened at a different real moment. Checked per driver, not
    just globally: a global check would still pass, since different drivers'
    own single timestamps differ from each other even when each driver's own
    markers are wrongly identical."""
    state = RaceState()
    replay_capture(CAPTURE, state, speed=0)
    tl = session_timeline(state)
    by_driver: dict[int, set[str]] = {}
    for m in tl["markers"]:
        if m.get("at"):
            by_driver.setdefault(m["driver_number"], set()).add(m["at"])
    multi_marker_drivers = {dn: ats for dn, ats in by_driver.items() if
                            sum(1 for mm in tl["markers"] if mm["driver_number"] == dn) > 1}
    assert multi_marker_drivers, "need at least one driver with 2+ session-best markers to test this"
    for dn, ats in multi_marker_drivers.items():
        assert len(ats) > 1, f"driver {dn}'s markers all share one timestamp"


@needs_capture
def test_the_safety_car_appears_as_its_own_band_in_the_race_timeline():
    state = RaceState()
    replay_capture(CAPTURE, state, speed=0)
    tl = session_timeline(state)
    sc_bands = [b for b in tl["bands"] if b["flag"] == FLAG_SC]
    assert sc_bands, "Baku 2026 had a safety car; it must show up on the timeline"
    assert all(b["duration_s"] > 0 for b in sc_bands)


@needs_capture
def test_session_timeline_is_available_for_the_race_profile_too():
    """Not only practice/qualifying — Task 4 asks for it in both, distinct
    from build_race_timeline's own "timeline" key."""
    state = RaceState()
    replay_capture(CAPTURE, state, speed=0, until_lap=10)
    assert state.profile == "race"
    analysis = live_analysis(state)
    assert "session_timeline" in analysis
    assert "bands" in analysis["session_timeline"]
    # and the race's own lap-indexed object is still there, unrenamed
    assert "total_laps" in analysis["timeline"]


# ── profile isolation: practice fields absent from race, and vice versa ─────

@needs_capture
def test_race_profile_snapshot_has_no_practice_fields():
    state = RaceState()
    replay_capture(CAPTURE, state, speed=0, until_lap=15)
    snap = state.snapshot()
    assert snap["profile"] == "race"
    assert "practice_tower" not in snap
    assert "session_status" not in snap
    assert snap["chaos"] is not None or snap["chaos"] is None  # present as a key either way
    assert "chaos" in snap


@needs_fp1
def test_practice_profile_snapshot_has_no_chaos_level():
    state = RaceState()
    replay(11727, state)
    snap = state.snapshot()
    assert snap["profile"] == "practice"
    assert snap["chaos"] is None
    assert snap["session_status"]["flag"] is not None
    assert "practice_tower" in snap and "pace" in snap and "long_runs" in snap


# ── the PRO gate is untouched (confirmed by the existing suite, not re-tested
# here — tests/test_live_server_http.py already asserts PRO_REQUIRED on the
# stream route, and live_server.py was not touched by this block at all) ────
