"""
Live projection — who is likely to win from here, and who is likely on pole.

This is the one part of the live page that is not a reading of the feed. It is
a model, labelled as one everywhere it appears: a Monte Carlo over the race's
remaining laps, built only from what the session has measured so far.

Race, per driver:
  start        current gap to the leader (a lapped car is a lap's time behind)
  pace         median of the last clean laps (no pit in/out, no neutralised,
               nothing over 107 % of the driver's own median)
  wear         the current stint's own lap-time slope, clamped to a sane range
  stops        still owed: a dry race needs two compounds, and no stint runs
               past MAX_STINT laps for its compound
  pit loss     the median pit-lane time measured this race (default 22 s)
  noise        the driver's own lap-to-lap spread, over the laps left, plus a
               per-simulation pace drift (PACE_DRIFT_S a lap) — form changes
  safety car   a per-lap chance; when it comes, the field closes up and a stop
               under it costs half

Distance: the scheduled lap count once known, otherwise the 305 km rule over a
lap length measured from the session's own track outline (OpenF1 location is
in tenths of a metre — calibrated on Sepang: 54 988 units, 5.543 km).

Qualifying / practice: pole odds from each driver's best lap and the ideal lap
(their best sectors summed) — the room they have left on a single lap.
"""
from __future__ import annotations

import math
import random
import statistics
from typing import Any

SIMULATIONS = 600
RACE_DISTANCE_M = 305_000
LOCATION_UNITS_PER_M = 10.0
DEFAULT_PIT_LOSS_S = 22.0
SC_PER_LAP = 0.006            # ≈ a 30 % chance of at least one SC over a 57-lap race
SC_GAP_S = 0.8                # spacing behind the safety car at the restart
# A driver's pace over the rest of the race is not the pace of the last six
# laps: traffic, a push or a save, a tyre coming in. Drawn once per driver per
# simulation and applied to every lap left — the uncertainty that dominates.
PACE_DRIFT_S = 0.18
MAX_STINT = {"SOFT": 22, "MEDIUM": 32, "HARD": 42, "INTERMEDIATE": 35, "WET": 35}
WEAR_RANGE = (-0.03, 0.25)
DEFAULT_WEAR = 0.05
MIN_LAPS_FOR_RACE = 3


def lap_length_m(outline: list[list[float]] | None) -> float | None:
    if not outline or len(outline) < 50:
        return None
    per = sum(math.dist(outline[i], outline[i - 1]) for i in range(len(outline)))
    metres = per / LOCATION_UNITS_PER_M
    return metres if 2500 <= metres <= 7500 else None     # outside that, the calibration is wrong


def estimated_distance(state) -> tuple[int | None, str]:
    if state.race_distance:
        return state.race_distance, "scheduled"
    length = lap_length_m(state.track_outline)
    if length:
        return math.ceil(RACE_DISTANCE_M / length), f"305 km over a {length / 1000:.3f} km lap measured on track"
    return None, "unknown — needs one clean lap of the circuit outline"


def _clean(laps: dict[int, float], exclude: set[int]) -> list[tuple[int, float]]:
    pts = [(ln, t) for ln, t in sorted(laps.items()) if ln > 1 and ln not in exclude]
    if not pts:
        return []
    med = statistics.median(t for _, t in pts)
    return [(ln, t) for ln, t in pts if t <= med * 1.07]


def _slope(points: list[tuple[int, float]]) -> float | None:
    if len(points) < 4:
        return None
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx if sxx else None


def race_projection(state, rng: random.Random | None = None) -> dict[str, Any]:
    rng = rng or random.Random(state.current_lap * 7919 + (state.session_key or 0))
    total, total_src = estimated_distance(state)
    lap_now = state.current_lap
    base: dict[str, Any] = {"kind": "race", "total_laps": total, "total_laps_source": total_src,
                            "lap": lap_now, "simulations": SIMULATIONS, "drivers": []}
    if lap_now < MIN_LAPS_FOR_RACE or total is None or state.chequered:
        base["reason"] = ("the race is over — see the result" if state.chequered
                          else "needs a few racing laps" if lap_now < MIN_LAPS_FOR_RACE
                          else total_src)
        return base
    left = max(0, total - lap_now)

    neutral = set(state.flag_laps)
    pit_lane = [m.get("lane_duration") or m.get("pit_duration") for m in state.store["v1/pit"].values()]
    pit_lane = [float(v) for v in pit_lane if isinstance(v, (int, float)) and 10 < v < 60]
    pit_loss = statistics.median(pit_lane) if len(pit_lane) >= 3 else DEFAULT_PIT_LOSS_S

    rows = []
    for dn, pos in sorted(state.position.items(), key=lambda kv: kv[1]):
        laps = state.lap_times.get(dn) or {}
        pits = set(state.pit_laps.get(dn, []))
        out_laps = {p + 1 for p in pits}
        clean = _clean(laps, neutral | pits | out_laps)
        if len(clean) < 3:
            continue
        recent = [t for _, t in clean[-6:]]
        pace = statistics.median(recent)
        spread = statistics.pstdev([t for _, t in clean[-10:]]) if len(clean) >= 4 else 0.5
        stint = state.current_stint(dn)
        start = stint.get("lap_start") or 1
        wear = _slope([p for p in clean if p[0] >= start])
        wear = DEFAULT_WEAR if wear is None else min(max(wear, WEAR_RANGE[0]), WEAR_RANGE[1])
        compound = (stint.get("compound") or "").upper()
        age = (lap_now - start + 1) + (stint.get("tyre_age_at_start") or 0)
        used = {(s.get("compound") or "").upper() for s in (state.stints.get(dn) or {}).values()}
        stops = 0
        if compound not in ("INTERMEDIATE", "WET") and len(used - {""}) < 2:
            stops = 1
        if age + left > MAX_STINT.get(compound, 35) * (1 + stops):
            stops += 1
        gap = state.gap.get(dn, {}).get("gap_to_leader")
        if isinstance(gap, str):          # "+1 LAP"
            n = int("".join(c for c in gap if c.isdigit()) or 1)
            gap = n * pace
        gap = float(gap) if isinstance(gap, (int, float)) else (0.0 if pos == 1 else None)
        if gap is None:
            continue
        # tyre time over the laps left: wear accrues from the current age, and
        # resets at each owed stop, which is spread evenly over the distance.
        seg = left / (stops + 1) if left else 0
        wear_time = 0.0
        a0 = age
        for _ in range(stops + 1):
            wear_time += wear * (seg * a0 + seg * (seg - 1) / 2)
            a0 = 1
        rows.append({
            "dn": dn, "pos": pos, "gap": gap, "pace": pace, "spread": max(0.15, min(spread, 1.2)),
            "wear": wear, "stops": stops, "compound": compound or None, "age": age,
            "remaining": left * pace + wear_time + stops * pit_loss,
        })
    if not rows:
        base["reason"] = "not enough clean laps yet"
        return base

    wins = {r["dn"]: 0 for r in rows}
    podiums = dict(wins)
    finish_pos: dict[int, list[int]] = {r["dn"]: [] for r in rows}
    p_sc = 1 - (1 - SC_PER_LAP) ** left
    for _ in range(SIMULATIONS):
        sc = rng.random() < p_sc
        sc_frac = rng.random() if sc else 1.0
        totals = []
        for r in rows:
            noise = (rng.gauss(0, r["spread"] * math.sqrt(max(left, 1)))
                     + rng.gauss(0, PACE_DRIFT_S) * left)
            if sc:
                # Gaps grown up to the SC, then the queue at restart.
                before = r["gap"] + sc_frac * (r["remaining"] - rows[0]["remaining"])
                totals.append((r["dn"], before, r, noise))
            else:
                totals.append((r["dn"], r["gap"] + r["remaining"] + noise, r, noise))
        if sc:
            order = sorted(totals, key=lambda x: x[1])
            totals = []
            for i, (dn, _, r, noise) in enumerate(order):
                # a stop owed is taken under the SC at half the loss
                saved = 0.5 * pit_loss if r["stops"] else 0.0
                rest = (1 - sc_frac) * (r["remaining"] - r["stops"] * pit_loss) + r["stops"] * pit_loss - saved
                totals.append((dn, i * SC_GAP_S + rest + noise, r, noise))
        ranked = sorted(totals, key=lambda x: x[1])
        for i, (dn, *_rest) in enumerate(ranked):
            finish_pos[dn].append(i + 1)
            if i == 0:
                wins[dn] += 1
            if i < 3:
                podiums[dn] += 1

    code = lambda dn: state.drivers.get(dn, {}).get("code", f"D{dn}")  # noqa: E731
    out = []
    for r in rows:
        fp = sorted(finish_pos[r["dn"]])
        out.append({
            "driver_number": r["dn"], "code": code(r["dn"]), "colour": state.drivers.get(r["dn"], {}).get("colour"),
            "position": r["pos"], "win": round(wins[r["dn"]] / SIMULATIONS, 3),
            "podium": round(podiums[r["dn"]] / SIMULATIONS, 3),
            "projected_position": fp[len(fp) // 2],
            "range": [fp[int(len(fp) * 0.1)], fp[int(len(fp) * 0.9) - 1]],
            "pace_s": round(r["pace"], 3), "wear_s_per_lap": round(r["wear"], 3),
            "stops_owed": r["stops"], "compound": r["compound"], "tyre_age": r["age"],
        })
    out.sort(key=lambda d: (-d["win"], d["projected_position"]))
    progress = lap_now / total
    base.update({
        "drivers": out, "laps_left": left, "pit_loss_s": round(pit_loss, 1),
        "pit_loss_source": "median measured this race" if len(pit_lane) >= 3 else "default",
        "sc_probability": round(p_sc, 2),
        "confidence": "High" if progress > 0.66 else "Medium" if progress > 0.25 else "Low",
    })
    return base


def pole_projection(state, practice_rows: list[dict], rng: random.Random | None = None) -> dict[str, Any]:
    rng = rng or random.Random(len(practice_rows) * 31 + (state.session_key or 0))
    rows = [r for r in practice_rows if r.get("best_lap_s")]
    base: dict[str, Any] = {"kind": "pole", "simulations": SIMULATIONS, "drivers": []}
    if len(rows) < 3:
        base["reason"] = "needs at least three timed laps"
        return base
    wins = {r["driver_number"]: 0 for r in rows}
    for _ in range(SIMULATIONS):
        best = None
        for r in rows:
            ideal = (r.get("ideal_lap") or {}).get("total") or r["best_lap_s"]
            room = max(0.0, r["best_lap_s"] - ideal)
            # the next attempt: somewhere between the ideal and a little worse than the best
            attempt = ideal + abs(rng.gauss(0, 0.12 + room * 0.6))
            t = min(r["best_lap_s"], attempt)
            if best is None or t < best[1]:
                best = (r["driver_number"], t)
        wins[best[0]] += 1
    out = [{
        "driver_number": r["driver_number"], "code": r["code"], "colour": r.get("colour"),
        "position": r["position"], "win": round(wins[r["driver_number"]] / SIMULATIONS, 3),
        "best_s": r["best_lap_s"], "ideal_s": (r.get("ideal_lap") or {}).get("total"),
    } for r in rows]
    out.sort(key=lambda d: -d["win"])
    base.update({"drivers": out, "confidence": "Medium" if len(rows) >= 10 else "Low"})
    return base
