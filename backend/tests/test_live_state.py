"""
The live path, against the Baku recording where it exists.

These are the four things that broke during the race, and the four things that
must keep working. Where the capture is available the test uses it, because a
synthetic message is exactly the message that does not reproduce the bug.
"""
from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "scripts"))

from live_state import (  # noqa: E402
    FLAG_GREEN, FLAG_RED, FLAG_SC, FLAG_VSC, RaceState, live_analysis,
    load_capture, normalise_dates, replay_capture,
)
from app.utils.time import parse_utc  # noqa: E402

CAPTURE = BACKEND / "live" / "2026-09-26_race_11377"
needs_capture = pytest.mark.skipif(
    not CAPTURE.is_dir(), reason="the Baku capture is not in this checkout"
)


# ── timestamps: the naive/aware TypeError ────────────────────────────────────

def test_parse_utc_reads_a_naive_timestamp_as_utc():
    """MQTT sends pit.date naive and race_control.date offset-qualified."""
    naive = parse_utc("2026-09-26T11:41:11.652000")
    aware = parse_utc("2026-09-26T10:11:25+00:00")
    assert naive.tzinfo is not None and aware.tzinfo is not None
    assert aware < naive          # the comparison that used to raise TypeError


def test_normalise_dates_qualifies_every_timestamp_field():
    msg = normalise_dates({
        "date": "2026-09-26T11:41:11.652000",
        "date_start": "2026-09-26T11:03:50.711000+00:00",
        "lap_number": 20,
    })
    assert msg["date"].endswith("+00:00")
    assert msg["date_start"].endswith("+00:00")
    assert msg["lap_number"] == 20


def test_normalised_dates_sort_as_strings():
    """position_at_lap orders records by comparing ISO text, not datetimes."""
    a = normalise_dates({"date": "2026-09-26T11:00:00"})["date"]
    b = normalise_dates({"date": "2026-09-26T12:00:00+00:00"})["date"]
    assert a < b


# ── flag detection: word boundaries ──────────────────────────────────────────

@pytest.mark.parametrize("message,expected", [
    ("CHEQUERED FLAG", FLAG_GREEN),      # contains the substring "RED FLAG"
    ("RED FLAG", FLAG_RED),
    ("SAFETY CAR DEPLOYED", FLAG_SC),
    ("VIRTUAL SAFETY CAR DEPLOYED", FLAG_VSC),
])
def test_flag_detection_is_word_bounded(message, expected):
    state = RaceState(session_key=1)
    state.ingest("v1/race_control", {"message": message, "lap_number": 10}, recv=100.0)
    assert state.flag == expected


def test_chequered_flag_is_not_a_red_flag():
    state = RaceState(session_key=1)
    state.ingest("v1/race_control", {"message": "CHEQUERED FLAG", "lap_number": 51}, recv=1.0)
    assert state.chequered is True
    assert state.flag == FLAG_GREEN


def test_sector_yellow_does_not_cancel_a_safety_car():
    state = RaceState(session_key=1)
    state.ingest("v1/race_control", {"message": "SAFETY CAR DEPLOYED", "lap_number": 31}, recv=1.0)
    state.ingest("v1/race_control",
                 {"flag": "YELLOW", "message": "YELLOW IN TRACK SECTOR 9", "lap_number": 32}, recv=2.0)
    assert state.flag == FLAG_SC


# ── upsert by _key ───────────────────────────────────────────────────────────

def test_a_republished_document_replaces_it_rather_than_duplicating():
    state = RaceState(session_key=1)
    start = {"driver_number": 4, "lap_number": 7, "lap_duration": None, "_key": "k7"}
    done = {"driver_number": 4, "lap_number": 7, "lap_duration": 92.5, "_key": "k7"}
    state.ingest("v1/laps", start, recv=1.0)
    state.ingest("v1/laps", done, recv=2.0)
    laps = state.lists()["v1/laps"]
    assert len(laps) == 1
    assert laps[0]["lap_duration"] == 92.5
    assert state.last_lap[4]["lap_duration"] == 92.5


def test_a_duration_already_received_is_not_lost_to_a_later_empty_republish():
    state = RaceState(session_key=1)
    state.ingest("v1/laps", {"driver_number": 4, "lap_number": 7, "lap_duration": 92.5, "_key": "a"}, recv=1.0)
    state.ingest("v1/laps", {"driver_number": 4, "lap_number": 7, "lap_duration": None, "_key": "b"}, recv=2.0)
    assert state.last_lap[4]["lap_duration"] == 92.5


# ── race distance ────────────────────────────────────────────────────────────

def test_race_distance_is_unknown_while_the_race_runs():
    state = RaceState(session_key=1)
    state.ingest("v1/laps", {"driver_number": 4, "lap_number": 30, "_key": "a"}, recv=1.0)
    distance, source = state.resolve_race_distance()
    assert distance is None
    assert "chequered" in source


def test_race_distance_is_known_at_the_chequered_flag():
    state = RaceState(session_key=1)
    state.ingest("v1/laps", {"driver_number": 4, "lap_number": 51, "_key": "a"}, recv=1.0)
    state.ingest("v1/race_control", {"message": "CHEQUERED FLAG", "lap_number": 51}, recv=2.0)
    distance, source = state.resolve_race_distance()
    assert distance == 51
    assert "chequered" in source


# ── the capture ──────────────────────────────────────────────────────────────

@needs_capture
def test_the_capture_replays_in_arrival_order():
    events = load_capture(CAPTURE)
    assert len(events) > 30000
    assert all(events[i][0] <= events[i + 1][0] for i in range(0, len(events) - 1, 97))


@needs_capture
def test_the_real_28_second_outage_is_reproduced():
    """
    The recorder logged: DISCONN! at 12:15:04, reconnected 12:15:32, "connection
    restored after 28.6s down". The data silence around it is longer, because
    the broker had already gone quiet before the socket dropped.
    """
    state = RaceState()
    info = replay_capture(CAPTURE, state, speed=0)
    big = [g for g in info["gaps_observed"] if g["seconds"] > 60 and g["at_lap"] > 1]
    assert len(big) == 1
    gap = big[0]
    assert gap["from"].startswith("2026-09-26T12:14")
    assert gap["to"].startswith("2026-09-26T12:15:32")
    assert 70 < gap["seconds"] < 80


@needs_capture
def test_the_capture_reaches_the_same_chaos_index_as_the_post_race_analysis():
    """
    The post-race report for 11377 scores 59/100 Extreme with peak lap 40, from
    the REST endpoints. The MQTT capture is a different transport of the same
    race and must land on the same number — if it does not, the live path is
    reading something the post-race path is not.
    """
    state = RaceState()
    replay_capture(CAPTURE, state, speed=0)
    chaos = live_analysis(state)["chaos"]
    assert chaos["score"] == 59
    assert chaos["level"] == "Extreme"
    assert chaos["final"] is True
    assert chaos["peak_chaos_lap"] == 40


@needs_capture
def test_chaos_has_no_level_before_the_chequered_flag():
    state = RaceState()
    replay_capture(CAPTURE, state, speed=0, until_lap=30)
    chaos = live_analysis(state)["chaos"]
    assert chaos["score"] > 0
    assert chaos["level"] is None
    assert chaos["final"] is False
    assert chaos["label"] == "Chaos density so far"
    assert chaos["race_distance"] is None


@needs_capture
def test_pit_cycles_do_not_report_deltas_until_the_field_has_passed_the_close_lap():
    state = RaceState()
    replay_capture(CAPTURE, state, speed=0, until_lap=33)
    pit = live_analysis(state)["pit"]

    open_cycles = [c for c in pit["cycles"] if c["status"] == "in progress"]
    assert open_cycles, "the lap 30-32 cycle is still settling at lap 33"
    for cycle in open_cycles:
        assert cycle["close_lap"] is None
        assert cycle["undercuts"] == []
        assert all("delta" not in p for p in cycle["participants"])
        assert "no gains or losses" in cycle["summary"]

    for cycle in (c for c in pit["cycles"] if c["status"] == "closed"):
        assert cycle["close_lap"] is not None
        assert any("delta" in p for p in cycle["participants"])


@needs_capture
def test_every_cycle_is_closed_once_the_race_has_finished():
    state = RaceState()
    replay_capture(CAPTURE, state, speed=0)
    pit = live_analysis(state)["pit"]
    assert pit["open_cycles"] == 0
    assert pit["stops"] == 34


@needs_capture
def test_pit_cycles_survive_the_naive_aware_mix_that_broke_them_live():
    """The regression: this raised TypeError against real MQTT documents."""
    state = RaceState()
    replay_capture(CAPTURE, state, speed=0, until_lap=40)
    pit = live_analysis(state)["pit"]
    assert pit["ok"] is True
    assert pit["stops"] > 0


@needs_capture
def test_pit_watch_signals_never_predict_a_stop():
    state = RaceState()
    replay_capture(CAPTURE, state, speed=0, until_lap=33)
    for signal in live_analysis(state)["pit_watch"]:
        assert signal["confidence"] in ("Low", "Medium", "High")
        assert signal["basis"]
        assert signal["disclaimer"] == "A measured signal, not a prediction of a stop."
        text = f"{signal['headline']} {signal['measurement']}".lower()
        for forbidden in ("will pit", "will stop", "expected to pit", "predict"):
            assert forbidden not in text


@needs_capture
def test_the_upsert_collapses_republished_laps_and_stints():
    state = RaceState()
    replay_capture(CAPTURE, state, speed=0)
    counts = state.counts
    documents = {t: len(b) for t, b in state.store.items()}
    assert counts["v1/laps"] > 7000 and documents["v1/laps"] < 1100
    assert counts["v1/stints"] > 1000 and documents["v1/stints"] < 100


# ── staleness: what a viewer sees when the broker goes quiet ─────────────────

def _racing_state() -> RaceState:
    state = RaceState(session_key=1)
    state.clock = lambda: _racing_state.now
    state.ingest("v1/laps", {"driver_number": 4, "lap_number": 10, "_key": "a"}, recv=1000.0)
    state.ingest("v1/intervals", {"driver_number": 4, "interval": 1.0, "_key": "i"}, recv=1000.0)
    return state


def test_a_quiet_feed_is_flagged_stale_while_the_race_is_running():
    state = _racing_state()
    _racing_state.now = 1000.0 + 5
    assert state.feed_health()["stale"] is False
    _racing_state.now = 1000.0 + 40
    health = state.feed_health()
    assert health["stale"] is True
    assert health["last_message_age_s"] == 40.0


def test_a_quiet_feed_is_not_flagged_before_the_start_or_after_the_flag():
    before = RaceState(session_key=1)
    before.clock = lambda: 9999.0
    before.ingest("v1/intervals", {"driver_number": 4, "_key": "i"}, recv=1000.0)
    assert before.feed_health()["stale"] is False        # current_lap is still 0

    after = _racing_state()
    after.ingest("v1/race_control", {"message": "CHEQUERED FLAG", "lap_number": 51}, recv=1001.0)
    _racing_state.now = 1000.0 + 600
    assert after.feed_health()["stale"] is False


def test_the_field_lap_lags_the_leader_and_ignores_a_retired_car():
    state = RaceState(session_key=1)
    state.clock = lambda: 2000.0
    state.ingest("v1/laps", {"driver_number": 1, "lap_number": 30, "_key": "a"}, recv=1990.0)
    state.ingest("v1/laps", {"driver_number": 2, "lap_number": 29, "_key": "b"}, recv=1985.0)
    state.ingest("v1/laps", {"driver_number": 3, "lap_number": 12, "_key": "c"}, recv=1000.0)  # retired
    assert state.current_lap == 30
    assert state.settled_through() == 29


@needs_capture
def test_chaos_is_withheld_entirely_in_the_opening_laps():
    state = RaceState()
    replay_capture(CAPTURE, state, speed=0, until_lap=2)
    chaos = live_analysis(state)["chaos"]
    assert chaos["score"] is None
    assert chaos["breakdown"] == []
    assert "denominator" in chaos["caveat"]


@needs_capture
def test_the_tower_shows_the_last_completed_lap_not_the_lap_in_progress():
    """
    ``last_lap`` holds the lap a driver is ON, and its duration is None until
    that lap finishes — reading a lap time off it leaves the column empty for
    the whole race.
    """
    state = RaceState()
    replay_capture(CAPTURE, state, speed=0, until_lap=6)
    leader = state.tower()[0]
    assert leader["last_lap_number"] == leader["lap_number"] - 1
    assert leader["last_lap_s"] and 80 < leader["last_lap_s"] < 200
    assert all(r["last_lap_s"] is not None for r in state.tower()[:10])


@needs_capture
def test_stint_length_needs_more_than_one_completed_stint_to_compare_against():
    """
    On the lap the first car completes a MEDIUM stint, every other car still on
    MEDIUM is "longer than the longest completed MEDIUM stint" — a statement
    about a sample of one that fired for eleven drivers at once.
    """
    state = RaceState()
    replay_capture(CAPTURE, state, speed=0, until_lap=25)
    signals = live_analysis(state)["pit_watch"]
    for signal in signals:
        assert signal["confidence"] != "Low"
        if signal["kind"] == "STINT_LENGTH":
            peers = int(signal["basis"].split()[0])
            assert peers >= 2


@needs_capture
def test_no_single_kind_of_signal_fills_the_panel():
    state = RaceState()
    replay_capture(CAPTURE, state, speed=0, until_lap=32)
    kinds = Counter(s["kind"] for s in live_analysis(state)["pit_watch"])
    assert kinds, "the safety car lap should produce signals"
    assert max(kinds.values()) <= 4
