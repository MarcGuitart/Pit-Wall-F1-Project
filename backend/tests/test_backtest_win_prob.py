"""scripts/backtest_win_prob.py — the rebuild, the baseline and the scores. Offline."""
from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "scripts"))

import backtest_win_prob as bt  # noqa: E402
import live_projection as lp  # noqa: E402

KL_CHARTS = BACKEND / "cache" / "11731" / "_lap_charts.json"


def charts() -> dict:
    """Three cars, ten laps. B is 1 s a lap slower than A; C retires after lap 4;
    A stops on lap 6 and the second stint only starts on lap 7."""
    def laps(base, n, pit=None):
        return [[ln, base + (20.0 if ln == pit else 0.0), ln == (pit or 0) + 1, ln == pit] for ln in range(1, n + 1)]
    return {
        "session_key": 1, "total_laps": 10, "winner": "AAA", "bands": [{"kind": "SC", "from": 8, "to": 8}],
        "drivers": [
            {"number": 1, "code": "AAA", "laps": laps(90.0, 10, pit=6),
             "stints": [{"stint_number": 1, "compound": "MEDIUM", "lap_start": 1, "lap_end": 6, "tyre_age_at_start": 0},
                        {"stint_number": 2, "compound": "HARD", "lap_start": 7, "lap_end": 10, "tyre_age_at_start": 0}]},
            {"number": 2, "code": "BBB", "laps": laps(91.0, 10),
             "stints": [{"stint_number": 1, "compound": "HARD", "lap_start": 1, "lap_end": 10, "tyre_age_at_start": 0}]},
            {"number": 3, "code": "CCC", "laps": laps(92.0, 4),
             "stints": [{"stint_number": 1, "compound": "SOFT", "lap_start": 1, "lap_end": 4, "tyre_age_at_start": 0}]},
        ],
    }


def test_rebuild_order_and_gaps_from_summed_lap_times():
    s = bt.state_from_lap_charts(charts(), 5)        # leader on lap 5: four laps done
    assert s.current_lap == 5 and s.race_distance == 10
    assert s.position == {1: 1, 2: 2, 3: 3}
    assert s.gap[2]["gap_to_leader"] == pytest.approx(4.0)
    assert s.gap[3]["gap_to_leader"] == pytest.approx(8.0)


def test_rebuild_sees_nothing_from_the_future():
    s = bt.state_from_lap_charts(charts(), 6)
    assert sorted(s.stints[1]) == [1]                  # the HARD stint starts on lap 7
    assert s.pit_laps[1] == []                         # the stop is on lap 6, not done yet
    assert max(s.lap_times[1]) == 5
    assert 8 not in s.flag_laps
    s = bt.state_from_lap_charts(charts(), 9)
    assert sorted(s.stints[1]) == [1, 2] and s.stints[1][2]["lap_end"] == 9
    assert s.pit_laps[1] == [6] and 8 in s.flag_laps
    # the stop cost A 20 s: B is ahead on track now
    assert s.position[2] == 1


def test_a_retired_car_leaves_the_rebuilt_order():
    assert 3 not in bt.state_from_lap_charts(charts(), 7).position


def test_baseline_is_the_normal_tail_of_the_gap():
    s = bt.state_from_lap_charts(charts(), 5)
    base, gap = bt.baseline(s)
    assert gap == pytest.approx(4.0)
    # three clean laps (lap 1 never counts): σ is the default until four
    sigma = bt._sigma(s, 1, 2)
    assert sigma == bt.SIGMA_DEFAULT
    # four, all the same 1 s difference: the spread is 0, floored
    assert bt._sigma(bt.state_from_lap_charts(charts(), 6), 1, 2) == bt.SIGMA_RANGE[0]
    z = 4.0 / (sigma * math.sqrt(5))
    assert base[1] == pytest.approx(0.5 * (1 + math.erf(z / math.sqrt(2))))
    assert base[1] + base[2] == pytest.approx(1.0)
    s.current_lap = 10
    assert bt.baseline(s)[0][1] == 1.0                 # no laps left: the leader


def test_scores_and_calibration():
    r = {"model": {1: 0.8, 2: 0.2}, "base": {1: 1.0, 2: 0.0}, "winner": 1, "leader": 1, "left": 2, "gap2": 6.0}
    m = bt._metrics(r, "model")
    assert m["brier"] == pytest.approx(0.04 + 0.04)
    assert m["logloss"] == pytest.approx(-math.log(0.8)) and m["top"]
    b = bt._metrics({**r, "winner": 2}, "base")
    assert b["logloss"] == pytest.approx(-math.log(bt.EPS))
    assert bt._ece([(0.9, True), (0.9, False)]) == pytest.approx(0.4)
    s = bt.summarise([r, {**r, "model": {1: 0.3, 2: 0.7}}])
    assert s["all"]["n"] == 2 and s["all"]["severe"] == 1 and s["all"]["severe_5s"] == 1
    assert s["buckets"]["0–2"]["n"] == 2


@pytest.mark.skipif(not KL_CHARTS.exists(), reason="Kuala Lumpur lap charts not in the cache")
def test_runs_on_a_published_race_offline(capsys):
    assert bt.main(["--races", "11731"]) == 0
    out = capsys.readouterr().out
    assert "| 11731 |" in out and "Por vueltas restantes" in out


@pytest.mark.skipif(not KL_CHARTS.exists(), reason="Kuala Lumpur lap charts not in the cache")
@pytest.mark.xfail(strict=True, reason="open defect of the current projection — Block 35")
def test_kuala_lumpur_the_winner_leading_with_two_laps_left_is_not_written_off():
    """
    VER leads lap 53 of 55 of Kuala Lumpur 2026, and won. He pitted on laps 9,
    33 and 43, but the stints feed published nothing after the softs fitted on
    lap 10 — so the projection reads 44-lap-old softs, past MAX_STINT, charges
    a stop he never made and gives the race to ANT.
    """
    s = bt.state_from_lap_charts(json.loads(KL_CHARTS.read_text()), 53)
    leader = min(s.position, key=s.position.get)
    assert s.drivers[leader]["code"] == "VER"
    assert s.pit_laps[leader] == [9, 33, 43]
    out = lp.race_projection(s, rng=random.Random(53))
    assert {d["driver_number"]: d["win"] for d in out["drivers"]}.get(leader, 0.0) >= 0.5
