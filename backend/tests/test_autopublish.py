"""
Automatic publication: which sessions, and when.

Publishing means committing an _analysis.json, which Render bakes into the image
and serves. A premature publication ships a half-race to production, so the cost
of being early is much higher than the cost of being late, and every test here is
written from that direction.

The fixtures are the real 2026 season shapes, including the two that matter most:

  Baku 2026 (11377)   a red flag pushed the real end past the published date_end.
                      The clock condition alone would have published it mid-race.
  Sakhir 2026 (11261) zero laps and no chequered flag in OpenF1 at all, six
                      months on. It is not waiting for anything; it is broken.

No network: every document is a literal here, and the pure functions under test
take documents rather than fetching them.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.core.version import ANALYSIS_VERSION
from app.services.autopublish import (
    EXCLUSIONS_FILE,
    MAX_PER_RUN,
    STUCK_AFTER,
    Candidate,
    has_chequered,
    is_cancelled,
    is_published,
    is_race_session,
    lap_count,
    parse_exclusions,
    publishable,
    readiness,
    select_candidates,
)
from app.utils.time import unlock_buffer


def iso(dt: datetime) -> str:
    return dt.isoformat()


# ── fixtures ─────────────────────────────────────────────────────────────────

BAKU_START = datetime(2026, 9, 26, 11, tzinfo=timezone.utc)
BAKU_END = datetime(2026, 9, 26, 13, tzinfo=timezone.utc)      # scheduled

def session(key: int, name: str = "Race", stype: str = "Race", year: int = 2026,
            start: datetime = BAKU_START, end: datetime | None = BAKU_END,
            circuit: str = "Baku") -> dict:
    return {
        "session_key": key, "session_name": name, "session_type": stype, "year": year,
        "circuit_short_name": circuit,
        "date_start": iso(start), "date_end": iso(end) if end else None,
    }


def candidate(key: int = 11377, name: str = "Race",
              start: datetime = BAKU_START, end: datetime | None = BAKU_END) -> Candidate:
    return Candidate(session_key=key, session_name=name, circuit="Baku", year=2026,
                     date_start=iso(start), date_end=iso(end) if end else None)


FINISHED_RC = [
    {"message": "GREEN LIGHT - PIT EXIT OPEN"},
    {"message": "RED FLAG", "flag": "RED"},
    {"message": "CHEQUERED FLAG", "flag": "CHEQUERED"},
]
MID_RACE_RC = [{"message": "SAFETY CAR DEPLOYED"}, {"message": "RED FLAG", "flag": "RED"}]


def laps(upto: int, drivers: int = 20) -> list[dict]:
    return [{"driver_number": d, "lap_number": n}
            for n in range(1, upto + 1) for d in range(1, drivers + 1)]


# ── candidate selection ──────────────────────────────────────────────────────

NOW = BAKU_END + timedelta(hours=1)


def test_only_race_session_types_are_candidates():
    sessions = [
        session(11377, "Race", "Race"),
        session(11376, "Qualifying", "Qualifying"),
        session(11375, "Practice 3", "Practice"),
        session(11374, "Sprint Qualifying", "Qualifying"),
    ]
    keys = [c.session_key for c in select_candidates(sessions, set(), NOW, 2026)]
    assert keys == [11377]


def test_a_sprint_is_a_candidate_because_openf1_types_it_as_a_race():
    """Sprints carry session_type "Race"; only the name differs. Both publish."""
    sprint = session(11348, "Sprint", "Race", circuit="Zandvoort")
    assert is_race_session(sprint)
    out = select_candidates([sprint], set(), NOW, 2026)
    assert [c.session_key for c in out] == [11348]
    assert out[0].session_name == "Sprint"


def test_other_seasons_are_not_candidates():
    sessions = [session(11377, year=2026), session(9636, year=2024), session(1, year=2027)]
    keys = [c.session_key for c in select_candidates(sessions, set(), NOW, 2026)]
    assert keys == [11377]


def test_the_year_defaults_to_the_current_one():
    now = datetime(2026, 9, 27, tzinfo=timezone.utc)
    assert [c.session_key for c in select_candidates([session(11377, year=2026)], set(), now)] == [11377]
    assert select_candidates([session(1, year=2025)], set(), now) == []


def test_an_already_published_session_is_not_a_candidate():
    assert select_candidates([session(11377)], {11377}, NOW, 2026) == []


def test_a_session_that_has_not_started_is_not_a_candidate():
    future = NOW + timedelta(days=7)
    upcoming = session(11380, start=future, end=future + timedelta(hours=2))
    assert select_candidates([upcoming], set(), NOW, 2026) == []


def test_a_session_in_progress_is_a_candidate_and_is_refused_by_readiness_instead():
    """So that "not yet" is reported with a reason rather than silently skipped."""
    started = NOW - timedelta(minutes=30)
    live = session(11380, start=started, end=started + timedelta(hours=2))
    out = select_candidates([live], set(), NOW, 2026)
    assert [c.session_key for c in out] == [11380]
    assert not readiness(out[0], MID_RACE_RC, laps(12), None, NOW).ready


def test_candidates_come_out_oldest_end_first():
    early = session(1, start=BAKU_START - timedelta(days=14), end=BAKU_END - timedelta(days=14))
    mid = session(2, start=BAKU_START - timedelta(days=7), end=BAKU_END - timedelta(days=7))
    late = session(3)
    out = select_candidates([late, early, mid], set(), NOW, 2026)
    assert [c.session_key for c in out] == [1, 2, 3]


def test_a_session_without_a_session_key_is_ignored_rather_than_crashing():
    broken = session(11377)
    broken["session_key"] = None
    assert select_candidates([broken, session(11378)], set(), NOW, 2026) == \
        select_candidates([session(11378)], set(), NOW, 2026)


# ── the three conditions ─────────────────────────────────────────────────────

def test_all_three_met_is_ready():
    r = readiness(candidate(), FINISHED_RC, laps(51), previous_lap_count=51, now=NOW)
    assert r.ready and r.missing() == []
    assert r.lap_count == 51


def test_the_clock_alone_is_not_enough_when_a_red_flag_extended_the_race():
    """
    Baku 2026. date_end says 13:00, but a red flag stopped the race and the
    chequered flag fell at 13:40. At 13:31 the clock condition passes — it is
    past date_end plus the 30-minute buffer — and the race is still running.
    Publishing then would ship a half-race to production.
    """
    now = BAKU_END + unlock_buffer() + timedelta(minutes=1)      # 13:31
    c = candidate()
    r = readiness(c, MID_RACE_RC, laps(34), previous_lap_count=34, now=now)

    assert r.clock is True                    # the clock says go
    assert r.chequered is False               # the flag says no
    assert r.ready is False
    assert r.missing() == ["chequered"]
    assert "CHEQUERED" in r.why()
    assert r.stuck is False                   # it is a wait, not a defect

    # and once the flag actually falls, with the extra laps, it publishes
    later = BAKU_END + timedelta(minutes=70)
    assert readiness(c, FINISHED_RC, laps(51), 51, later).ready


def test_inside_the_buffer_is_not_ready_even_with_the_flag_out():
    now = BAKU_END + timedelta(minutes=5)
    r = readiness(candidate(), FINISHED_RC, laps(51), 51, now)
    assert r.clock is False and r.missing() == ["clock"]
    assert "buffer" in r.why()


def test_the_gate_uses_the_same_buffer_as_the_analysis_endpoint():
    """A publication the API would then refuse to serve is worse than no
    publication, so the two must open at the same moment."""
    c = candidate()
    just_before = BAKU_END + unlock_buffer() - timedelta(seconds=1)
    just_after = BAKU_END + unlock_buffer()
    assert readiness(c, FINISHED_RC, laps(51), 51, just_before).clock is False
    assert readiness(c, FINISHED_RC, laps(51), 51, just_after).clock is True


def test_a_growing_lap_count_is_not_ready():
    r = readiness(candidate(), FINISHED_RC, laps(51), previous_lap_count=48, now=NOW)
    assert r.stable_laps is False
    assert r.missing() == ["stable_laps"]
    assert "48 → 51" in r.why()


def test_a_first_observation_waits_one_run_and_is_never_stuck():
    r = readiness(candidate(), FINISHED_RC, laps(51), previous_lap_count=None, now=NOW)
    assert r.stable_laps is False and r.ready is False
    assert r.stuck is False
    assert "first observation" in r.why()


def test_the_lap_count_is_the_highest_lap_number_not_the_row_count():
    """One row per driver per lap: len() would be 20x the laps."""
    assert lap_count(laps(51, drivers=20)) == 51
    assert lap_count([]) == 0
    assert lap_count([{"lap_number": None}, {"lap_number": 7}, {"nothing": 1}]) == 7


def test_zero_laps_is_never_stable_however_many_runs_agree():
    r = readiness(candidate(), FINISHED_RC, [], previous_lap_count=0, now=NOW)
    assert r.stable_laps is False
    assert "no laps" in r.why()


@pytest.mark.parametrize("messages, expected", [
    ([{"message": "CHEQUERED FLAG"}], True),
    ([{"flag": "CHEQUERED"}], True),
    ([{"message": "chequered flag"}], True),
    ([{"message": "RED FLAG"}], False),
    ([{"message": "SAFETY CAR DEPLOYED"}], False),
    ([], False),
    ([{"message": None}], False),
])
def test_the_chequered_flag_is_matched_on_word_boundaries(messages, expected):
    assert has_chequered(messages) is expected


def test_the_substring_trap_that_has_bitten_this_repo_twice():
    """"CHEQUERED FLAG" contains "RED FLAG". Never match a flag by substring."""
    assert "RED FLAG" in "CHEQUERED FLAG"
    assert has_chequered([{"message": "RED FLAG"}]) is False
    assert has_chequered([{"message": "CHEQUERED FLAG"}]) is True


# ── stuck: a data problem, not a wait ────────────────────────────────────────

LONG_AFTER = BAKU_END + STUCK_AFTER + timedelta(minutes=1)


def test_no_chequered_flag_long_past_the_end_is_stuck():
    """Sakhir and Jeddah 2026: zero laps and no flag in OpenF1, months later."""
    r = readiness(candidate(11261), [], [], previous_lap_count=None, now=LONG_AFTER)
    assert r.ready is False and r.stuck is True
    assert set(r.missing()) == {"chequered", "stable_laps"}


def test_no_laps_long_past_the_end_is_stuck():
    r = readiness(candidate(), FINISHED_RC, [], previous_lap_count=None, now=LONG_AFTER)
    assert r.stuck is True


def test_a_settled_session_long_past_its_end_needs_no_second_run():
    """
    The stability check exists to catch a feed still catching up. Six hours on,
    nothing is catching up, so requiring a second observation would make every
    race in the back catalogue wait an extra run for nothing.
    """
    r = readiness(candidate(), FINISHED_RC, laps(51), previous_lap_count=None, now=LONG_AFTER)
    assert r.ready is True and r.stuck is False
    assert r.settled is True
    assert "settled" in r.why()


def test_just_inside_the_stuck_window_is_still_only_waiting():
    almost = BAKU_END + STUCK_AFTER - timedelta(minutes=1)
    r = readiness(candidate(), [], [], previous_lap_count=None, now=almost)
    assert r.stuck is False and r.ready is False


def test_a_race_still_running_is_never_stuck():
    now = BAKU_END + timedelta(minutes=40)
    assert readiness(candidate(), MID_RACE_RC, laps(34), 30, now).stuck is False


def test_stuck_and_ready_are_mutually_exclusive():
    for prev in (None, 51):
        for rc in ([], FINISHED_RC):
            for lp in ([], laps(51)):
                for now in (NOW, LONG_AFTER, BAKU_END):
                    r = readiness(candidate(), rc, lp, prev, now)
                    assert not (r.ready and r.stuck)


# ── the per-run cap ──────────────────────────────────────────────────────────

def test_at_most_two_sessions_publish_per_run():
    assert MAX_PER_RUN == 2
    ready = [candidate(k) for k in (1, 2, 3, 4, 5)]
    now, later = publishable(ready)
    assert [c.session_key for c in now] == [1, 2]
    assert [c.session_key for c in later] == [3, 4, 5]


def test_the_cap_takes_the_oldest_first_so_nothing_starves():
    """
    A whole weekend can be ready at once — sprint and race, or a backfill. The
    cap must publish the oldest, so the queue drains in order instead of the same
    two sessions winning every run.
    """
    starts = [BAKU_START - timedelta(days=d) for d in (0, 21, 7, 14)]
    sessions = [session(k, start=s, end=s + timedelta(hours=2))
                for k, s in zip((4, 1, 3, 2), starts)]
    ordered = select_candidates(sessions, set(), NOW, 2026)
    first_two, rest = publishable(ordered)
    assert [c.session_key for c in first_two] == [1, 2]
    # and the next run, with those two done, takes the next two
    ordered_after = select_candidates(sessions, {1, 2}, NOW, 2026)
    assert [c.session_key for c in publishable(ordered_after)[0]] == [3, 4]


def test_fewer_ready_than_the_cap_defers_nothing():
    now, later = publishable([candidate(1)])
    assert len(now) == 1 and later == []


def test_nothing_ready_publishes_nothing():
    assert publishable([]) == ([], [])


# ── the ANALYSIS_VERSION ledger ──────────────────────────────────────────────

def test_an_analysis_at_the_current_version_counts_as_published():
    assert is_published({"analysis_version": ANALYSIS_VERSION}, ANALYSIS_VERSION) is True


def test_an_analysis_from_an_older_pipeline_is_not_published():
    """A version bump makes every cached session a candidate again — that is how
    a pipeline change reaches the site without anyone regenerating by hand."""
    assert is_published({"analysis_version": "3"}, "4") is False
    assert is_published({"analysis_version": None}, "4") is False
    assert is_published({}, "4") is False


def test_a_missing_analysis_is_not_published():
    assert is_published(None, ANALYSIS_VERSION) is False


def test_the_ledger_drives_candidate_selection_after_a_bump():
    """The end-to-end shape of it: the done set is built from the stamp."""
    metas = [session(11377), session(11369, circuit="Madring",
                                    start=BAKU_START - timedelta(days=13),
                                    end=BAKU_END - timedelta(days=13))]
    on_disk = {11377: {"analysis_version": "4"}, 11369: {"analysis_version": "3"}}
    done = {k for k, a in on_disk.items() if is_published(a, "4")}
    assert done == {11377}
    assert [c.session_key for c in select_candidates(metas, done, NOW, 2026)] == [11369]


def test_the_current_version_is_a_non_empty_string():
    """A bump to a non-string, or an empty one, would make everything stale."""
    assert isinstance(ANALYSIS_VERSION, str) and ANALYSIS_VERSION.strip()


# ── no date_end at all ───────────────────────────────────────────────────────

def test_a_session_with_no_date_end_falls_back_to_the_type_estimate():
    c = candidate(end=None)
    estimated_end = BAKU_START + timedelta(hours=3)       # the Race estimate
    assert c.end() == estimated_end
    assert readiness(c, FINISHED_RC, laps(51), 51, estimated_end - timedelta(minutes=1)).clock is False
    assert readiness(c, FINISHED_RC, laps(51), 51,
                     estimated_end + unlock_buffer()).clock is True


# ── cancelled and excluded sessions ──────────────────────────────────────────
#
# Sakhir and Jeddah 2026 were cancelled. Before this they were candidates that
# failed the readiness check for ever: six months on, every hourly run found
# them stuck and filed an issue about a race that did not happen.

SAKHIR = datetime(2026, 4, 12, 15, tzinfo=timezone.utc)


def cancelled_session(key: int = 11261, circuit: str = "Sakhir") -> dict:
    meta = session(key, circuit=circuit, start=SAKHIR,
                   end=SAKHIR + timedelta(hours=2))
    meta["is_cancelled"] = True
    return meta


def test_a_cancelled_session_is_never_a_candidate():
    now = SAKHIR + timedelta(days=180)
    assert select_candidates([cancelled_session()], set(), now, 2026) == []


def test_only_the_boolean_true_means_cancelled():
    """
    A missing or absent flag must read as "not cancelled". Defaulting the other
    way would silently stop publishing the entire season the day OpenF1 renames
    the field.
    """
    now = BAKU_END + timedelta(hours=3)
    for value in (False, None, "false", 0):
        meta = session(11377)
        if value is not None:
            meta["is_cancelled"] = value
        assert len(select_candidates([meta], set(), now, 2026)) == 1, value
    assert not is_cancelled({})
    assert not is_cancelled({"is_cancelled": "true"})
    assert is_cancelled({"is_cancelled": True})


def test_an_excluded_session_is_never_a_candidate():
    now = BAKU_END + timedelta(hours=3)
    meta = session(11377)
    assert len(select_candidates([meta], set(), now, 2026)) == 1
    assert select_candidates([meta], set(), now, 2026, {11377: "by hand"}) == []


def test_the_exclusion_file_in_the_repo_names_sakhir_and_jeddah_with_reasons():
    path = Path(__file__).resolve().parents[1] / EXCLUSIONS_FILE
    excluded = parse_exclusions(json.loads(path.read_text()))
    assert set(excluded) == {11261, 11269}
    for key, reason in excluded.items():
        assert "cancel" in reason.lower(), key
        assert len(reason) > 40, "a reason, not a label"


def test_a_malformed_exclusion_row_is_ignored_rather_than_guessed():
    parsed = parse_exclusions({"excluded": [
        {"session_key": 11261, "label": "Sakhir", "reason": "cancelled"},
        {"session_key": "11269", "reason": "a string key"},
        {"reason": "no key at all"},
        {},
    ]})
    assert list(parsed) == [11261]


def test_no_exclusions_file_means_nothing_is_excluded():
    assert parse_exclusions(None) == {}
    assert parse_exclusions({}) == {}


# ── the backfill cap ─────────────────────────────────────────────────────────

def test_the_default_cap_defers_the_rest():
    ready = [candidate(11234 + i) for i in range(5)]
    now, later = publishable(ready)
    assert len(now) == MAX_PER_RUN
    assert len(later) == 5 - MAX_PER_RUN


def test_limit_zero_is_no_cap_not_publish_nothing():
    """
    The backfill. ready[:0] is empty, and an empty publish list reads as
    "nothing was ready" — a success that published nothing.
    """
    ready = [candidate(11234 + i) for i in range(19)]
    now, later = publishable(ready, 0)
    assert len(now) == 19
    assert later == []


def test_a_negative_limit_is_treated_as_no_cap_rather_than_reversed_slicing():
    ready = [candidate(11234 + i) for i in range(3)]
    assert publishable(ready, -1) == (ready, [])
