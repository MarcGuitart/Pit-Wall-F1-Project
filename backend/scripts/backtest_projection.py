"""
Backtest the live race projection against races that actually finished.

    python scripts/backtest_projection.py                  # every cached race with raw laps
    python scripts/backtest_projection.py --grid           # also search PACE_DRIFT_S / SC_PER_LAP

Each race is replayed from its cached REST data to 25 / 50 / 75 / 90 % of its
distance, the projection is run there, and its win odds and projected order
are scored against the classified result. The baseline is the naive call a
viewer would make: the current leader wins and the order holds.

  log loss   −log(p assigned to the actual winner); lower is better
  brier      Σ (p − won)² over the field; lower is better
  top pick   the favourite won
  rank ρ     Spearman between projected and actual finishing order
"""
from __future__ import annotations

import argparse
import itertools
import json
import math
import random
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, ".")

import live_projection as lp  # noqa: E402
from live_state import RaceState, replay  # noqa: E402

FRACTIONS = (0.25, 0.5, 0.75, 0.9)
EPS = 0.005                       # the floor on a probability, so one miss is not infinite


def races() -> list[int]:
    out = []
    for a in sorted(Path("cache").glob("*/_analysis.json")):
        d = a.parent
        if (d / "laps.json").exists() and (d / "intervals.json").exists() and (d / "position.json").exists():
            out.append(int(d.name))
    return out


def result(key: int) -> tuple[dict[int, int], int]:
    analysis = json.loads((Path("cache") / str(key) / "_analysis.json").read_text())
    order = {r["driver_number"]: r["finishing_position"] for r in analysis.get("race_classification") or []
             if isinstance(r.get("finishing_position"), int)}
    laps = json.loads((Path("cache") / str(key) / "laps.json").read_text())
    total = max(l.get("lap_number") or 0 for l in laps)
    return order, total


def spearman(a: list[int], b: list[int]) -> float:
    n = len(a)
    if n < 3:
        return float("nan")
    ra = {v: i for i, v in enumerate(sorted(range(n), key=lambda i: a[i]))}
    rb = {v: i for i, v in enumerate(sorted(range(n), key=lambda i: b[i]))}
    d2 = sum((ra[i] - rb[i]) ** 2 for i in range(n))
    return 1 - 6 * d2 / (n * (n * n - 1))


_STATES: dict[tuple[int, float], RaceState] = {}


def state_at(key: int, frac: float, total: int) -> RaceState:
    """Replayed once and reused: the projection only reads the state."""
    if (key, frac) not in _STATES:
        s = RaceState(session_key=key)
        replay(key, s, until_lap=max(lp.MIN_LAPS_FOR_RACE, int(total * frac)))
        s.race_distance = total
        _STATES[(key, frac)] = s
    return _STATES[(key, frac)]


def score(key: int, frac: float, order: dict[int, int], total: int) -> dict | None:
    s = state_at(key, frac, total)
    lap = s.current_lap
    proj = lp.race_projection(s, rng=random.Random(key * 100 + lap))
    drivers = [d for d in proj["drivers"] if d["driver_number"] in order]
    if not drivers:
        return None
    winner = min(order, key=order.get)
    p_win = {d["driver_number"]: d["win"] for d in drivers}
    p = max(EPS, p_win.get(winner, 0.0))
    leader = min(drivers, key=lambda d: d["position"])
    favourite = max(drivers, key=lambda d: d["win"])
    return {
        "race": key, "frac": frac, "lap": lap,
        "logloss": -math.log(p),
        "brier": sum((p_win.get(dn, 0) - (dn == winner)) ** 2 for dn in p_win),
        "top": favourite["driver_number"] == winner,
        "rho": spearman([d["projected_position"] for d in drivers], [order[d["driver_number"]] for d in drivers]),
        # baseline: the leader wins, the order holds
        "base_logloss": -math.log(1 - EPS if leader["driver_number"] == winner else EPS),
        "base_brier": sum(((dn == leader["driver_number"]) - (dn == winner)) ** 2 for dn in p_win),
        "base_top": leader["driver_number"] == winner,
        "base_rho": spearman([d["position"] for d in drivers], [order[d["driver_number"]] for d in drivers]),
    }


def run(keys: list[int], quiet: bool = False) -> dict:
    rows = []
    for key in keys:
        order, total = result(key)
        for f in FRACTIONS:
            r = score(key, f, order, total)
            if r:
                rows.append(r)
                if not quiet:
                    print(f"  {key} {int(f*100):>3}% L{r['lap']:<3} logloss {r['logloss']:.2f} (base {r['base_logloss']:.2f})"
                          f"  top {'✓' if r['top'] else '✗'} (base {'✓' if r['base_top'] else '✗'})"
                          f"  ρ {r['rho']:.2f} (base {r['base_rho']:.2f})")
    m = lambda k: statistics.fmean(r[k] for r in rows if not math.isnan(r[k]))  # noqa: E731
    return {k: round(m(k), 3) for k in ("logloss", "base_logloss", "brier", "base_brier", "top", "base_top", "rho", "base_rho")} | {"n": len(rows)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--grid", action="store_true")
    ap.add_argument("--races", help="comma-separated session keys (default: every cached race)")
    args = ap.parse_args()
    keys = [int(k) for k in args.races.split(',')] if args.races else races()
    print(f"races: {keys}")
    summary = run(keys)
    print("summary", summary)
    if args.grid:
        best = None
        for drift, pass_cost, shrink in itertools.product((0.1, 0.18, 0.3), (1.0, 3.0, 6.0, 10.0), (0.3, 0.5, 0.8)):
            lp.PACE_DRIFT_S, lp.PASS_COST_S, lp.PACE_SHRINK = drift, pass_cost, shrink
            r = run(keys, quiet=True)
            print(f"  drift {drift:.2f} pass {pass_cost:.1f} shrink {shrink:.2f} -> logloss {r['logloss']:.3f} "
                  f"brier {r['brier']:.3f} top {r['top']:.2f} rho {r['rho']:.2f}", flush=True)
            if best is None or r["logloss"] < best[0]:
                best = (r["logloss"], drift, pass_cost, shrink)
        print("best", best)
    return 0


if __name__ == "__main__":
    sys.exit(main())
