"""
What any win probability shown live must satisfy, whatever model is behind it.

Written for Block 35 against the current Monte Carlo (scripts/live_projection.py)
before any fix, so the ones it breaks are marked xfail(strict=True): they are
the open defects, and the day one passes the strict marker turns it red and the
marker has to come off. The model is not changed here.

The fixtures are built the way the live server sees a race: lap times, a
running order, gaps to the leader, stints and pit laps — with one realistic
fault, the one Kuala Lumpur 2026 shows in its published lap charts: the stints
feed misses the stints after a stop (VER pitted on laps 9, 33 and 43; the feed
still has him on the softs he fitted on lap 10). The Kuala Lumpur case
itself is in test_backtest_win_prob.py.

No network: synthetic states and the Baku capture when it is on disk (BAKU_CAPTURE, skipped otherwise).
"""
from __future__ import annotations

import math
import os
import random
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "scripts"))

import live_projection as lp  # noqa: E402
from live_state import RaceState, replay_capture  # noqa: E402

BAKU = Path(os.environ.get("BAKU_CAPTURE", BACKEND / "live" / "2026-09-26_race_11377"))

OPEN_DEFECT = pytest.mark.xfail(strict=True, reason="open defect of the current projection — Block 35")


def race(lap: int, total: int = 55, gaps=(0.0, 15.0, 18.0, 21.0, 24.0, 27.0), pace=95.0,
         pit_lap: int = 20, stale_leader_stints: bool = False) -> RaceState:
    """
    A dry race on lap ``lap`` of ``total``: every car stopped once on ``pit_lap``
    (MEDIUM then HARD), runs the same pace with a little wear and lap-to-lap
    noise, and holds the given gap to the leader. With ``stale_leader_stints``
    the stints feed never delivered the leader's second stint — the pit lap is
    there, the tyre change is not.
    """
    s = RaceState(session_key=1)
    s.race_distance = total
    s.current_lap = lap
    rng = random.Random(7)
    for i, gap in enumerate(gaps):
        dn = i + 1
        s.drivers[dn] = {"code": f"D{dn}", "colour": None}
        s.position[dn] = i + 1
        s.gap[dn] = {"gap_to_leader": gap}
        s.pit_laps[dn] = [pit_lap] if pit_lap < lap else []
        for ln in range(1, lap):
            age = ln if ln <= pit_lap else ln - pit_lap
            t = pace + 0.05 * age + rng.gauss(0, 0.15)
            if ln in (pit_lap, pit_lap + 1):
                t += 11.0
            s.lap_times[dn][ln] = round(t, 3)
        s.stints[dn][1] = {"stint_number": 1, "compound": "MEDIUM", "lap_start": 1,
                           "lap_end": min(pit_lap, lap), "tyre_age_at_start": 0}
        if pit_lap < lap and not (stale_leader_stints and dn == 1):
            s.stints[dn][2] = {"stint_number": 2, "compound": "HARD", "lap_start": pit_lap + 1,
                               "lap_end": lap, "tyre_age_at_start": 0}
    return s


def p_win(out: dict) -> dict[int, float]:
    return {d["driver_number"]: d["win"] for d in out["drivers"]}


def project(s: RaceState) -> dict:
    return lp.race_projection(s, rng=random.Random(1000 + s.current_lap))


# ── 1. monotonicity ──────────────────────────────────────────────────────────

MC_TOLERANCE = 0.01         # 600 simulations: a 1-point wobble is sampling, not the model


def _leader_curve(**kw) -> list[tuple[int, float]]:
    """P(leader) on lap 40 as the laps left go from 25 to 0 — the same laps,
    gaps and stints every time; only the scheduled distance changes."""
    out = []
    for left in range(25, -1, -1):
        s = race(40, total=40 + left, **kw)
        out.append((left, p_win(project(s)).get(1, 0.0)))
    return out


def _drops(curve):
    return [(a, b) for a, b in zip(curve, curve[1:]) if b[1] < a[1] - MC_TOLERANCE]


def test_leader_probability_does_not_fall_as_laps_run_out_clean_feed():
    assert not _drops(_leader_curve())


@OPEN_DEFECT
def test_leader_probability_does_not_fall_as_laps_run_out_stale_stints():
    curve = _leader_curve(stale_leader_stints=True)
    assert not _drops(curve), curve


# ── 2. an unrecoverable gap ──────────────────────────────────────────────────

def _unrecoverable(s: RaceState, out: dict) -> bool:
    """The leader's gap cannot be closed at the pace observed: the next car
    would need more per lap than the whole spread of paces in the field."""
    paces = [d["pace_s"] for d in out["drivers"]]
    left = max(out["laps_left"], 1)
    second = sorted(s.gap.items(), key=lambda kv: s.position[kv[0]])[1][1]["gap_to_leader"]
    return second / left > 3 * (max(paces) - min(paces) + 0.5)


def test_unrecoverable_gap_others_under_one_percent_clean_feed():
    s = race(53)
    out = project(s)
    assert _unrecoverable(s, out)
    assert sum(p for dn, p in p_win(out).items() if dn != 1) < 0.01


@OPEN_DEFECT
def test_unrecoverable_gap_others_under_one_percent_stale_stints():
    s = race(53, stale_leader_stints=True)          # 15 s ahead, 2 laps left
    out = project(s)
    assert _unrecoverable(s, out)
    assert sum(p for dn, p in p_win(out).items() if dn != 1) < 0.01, p_win(out)


@OPEN_DEFECT
def test_a_retired_car_with_a_frozen_gap_cannot_win():
    # P6 stopped on lap 36; its last gap_to_leader (taken under the safety car)
    # stays in the state, as NOR's 1.332 s did in the Baku capture.
    s = race(53)
    s.position[6] = 6
    s.gap[6] = {"gap_to_leader": 1.3}
    s.lap_times[6] = {ln: t for ln, t in s.lap_times[6].items() if ln <= 36}
    s.stints[1] = {1: s.stints[1][1]}               # and the leader's stints are stale
    out = project(s)
    assert p_win(out).get(6, 0.0) < 0.01, p_win(out)


@pytest.mark.skipif(not BAKU.is_dir(), reason="Baku capture not present (set BAKU_CAPTURE)")
@OPEN_DEFECT
def test_baku_two_laps_to_go_with_a_stale_stints_feed():
    """
    The Block 35 symptom on real data: Baku 2026, lap 49 of 51, RUS leads. The
    only change to the capture is the one Kuala Lumpur shows happens: the
    stints feed has missed every stint after the first stop for the top five.
    The model then hands the race to a car outside the top five (P6 HAM, and
    above all P19 NOR — retired on lap 36, its last gap frozen at 1.3 s).
    """
    s = RaceState()
    replay_capture(BAKU, s, speed=0, until_lap=49)
    s.race_distance = 51
    top5 = [dn for dn, _ in sorted(s.position.items(), key=lambda kv: kv[1])[:5]]
    for dn in top5:
        first = min(s.stints[dn])
        s.stints[dn] = {first: {**s.stints[dn][first], "lap_end": None}}
    out = project(s)
    leader = top5[0]
    assert out["drivers"][0]["driver_number"] == leader, [(d["code"], d["position"], d["win"]) for d in out["drivers"][:3]]


# ── 3. no laps left ──────────────────────────────────────────────────────────

@pytest.mark.parametrize("gaps", [(0.0, 15.0, 18.0, 21.0, 24.0, 27.0), (0.0, 0.3, 0.9, 1.5, 2.0, 2.4)])
def test_zero_laps_left_the_leader_wins_with_one_clean_feed(gaps):
    out = project(race(55, gaps=gaps))
    assert out["laps_left"] == 0
    assert p_win(out)[1] == 1.0, p_win(out)


@OPEN_DEFECT
def test_zero_laps_left_the_leader_wins_with_one_stale_stints():
    out = project(race(55, stale_leader_stints=True))
    assert out["laps_left"] == 0
    assert p_win(out)[1] == 1.0, p_win(out)


# ── 4. a distribution ────────────────────────────────────────────────────────

@pytest.mark.parametrize("lap,stale", [(5, False), (30, False), (53, False), (55, False), (30, True), (53, True)])
def test_win_probabilities_sum_to_one_and_stay_in_the_unit_interval(lap, stale):
    out = project(race(lap, stale_leader_stints=stale))
    ps = list(p_win(out).values())
    assert ps and all(0.0 <= p <= 1.0 for p in ps)
    assert math.isclose(sum(ps), 1.0, abs_tol=0.01), sum(ps)


# ── 5. not enough data, no number ────────────────────────────────────────────

def test_no_probability_before_the_minimum_laps():
    out = project(race(2))
    assert out["drivers"] == [] and out.get("reason")


def test_no_probability_without_a_race_distance():
    s = race(30)
    s.race_distance = None
    out = project(s)
    assert out["drivers"] == [] and out.get("reason")


@OPEN_DEFECT
def test_no_probability_when_the_leader_cannot_be_modelled():
    # The leader has two timed laps in the state (its lap messages lost on a
    # reconnect); the others have thirty. Odds over the rest of the field,
    # with the car in front left out, are not odds of who wins.
    s = race(32)
    s.lap_times[1] = {30: 95.1, 31: 95.0}
    out = project(s)
    assert out["drivers"] == [] and out.get("reason"), p_win(out)
