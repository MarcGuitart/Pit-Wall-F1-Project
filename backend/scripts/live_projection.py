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

Validated with scripts/backtest_projection.py (2026-10-03), at 25/50/75/90 %
of each race, against "the current leader wins and the order holds":

                         tuned on 6 races          held out: 8 races of 2026
                         model     baseline        model     baseline
  winner picked          83 %      83 %            81 %      75 %
  log loss (winner)      0.68      0.89            0.53      1.33
  Brier                  0.30      0.33            0.29      0.50
  order ρ                0.89      0.89            0.77      0.86

The win odds beat the naive call out of sample; the full projected order does
not yet — the stops-owed heuristic misplaces the midfield — so the page leads
with win and podium odds. Re-run the backtest after changing anything here.
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
# Track position. A faster car does not simply drive through the one ahead:
# it needs a margin to pass, and a leader with a gap manages its pace rather
# than showing it. Both were missing from the first version, and the backtest
# (scripts/backtest_projection.py) showed a pure pace extrapolation losing to
# "the leader wins" — these two terms are what fixed that.
PASS_COST_S = 10.0            # time a car must have in hand to finish ahead of one it is behind on track
PACE_SHRINK = 0.8             # how much of a measured pace difference is kept (the rest is noise)
MAX_STINT = {"SOFT": 22, "MEDIUM": 32, "HARD": 42, "INTERMEDIATE": 35, "WET": 35}
WEAR_RANGE = (-0.03, 0.25)
# the fuel model the lap charts use (frontend/lib/lapCharts.ts) — keep in step
FUEL_EFFECT_S_PER_KG = 0.055
FUEL_START_KG = 110.0
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


def _settle(totals: list[tuple], by_dn: dict[int, dict]) -> list[tuple]:
    """
    Finishing order from projected times, with track position. Cars are taken
    in their current running order; one finishes ahead of a car currently in
    front of it only if it gets there with PASS_COST_S in hand — or if the two
    owe a different number of stops, when the pit cycle reorders them without
    an overtake.
    """
    current = sorted(totals, key=lambda t: by_dn[t[0]]["pos"])
    out: list[tuple] = []
    for car in current:
        j = len(out)
        while j > 0:
            ahead = out[j - 1]
            same_cycle = by_dn[ahead[0]]["stops"] == by_dn[car[0]]["stops"]
            margin = PASS_COST_S if same_cycle else 0.0
            if car[1] < ahead[1] - margin:
                j -= 1
            else:
                break
        out.insert(j, car)
    return out


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
    fuel_s_per_lap = FUEL_EFFECT_S_PER_KG * FUEL_START_KG / total
    pit_lane = [m.get("lane_duration") or m.get("pit_duration") for m in state.store["v1/pit"].values()]
    pit_lane = [float(v) for v in pit_lane if isinstance(v, (int, float)) and 10 < v < 60]
    pit_loss = statistics.median(pit_lane) if len(pit_lane) >= 3 else DEFAULT_PIT_LOSS_S

    # Pass 1 — what each car has measured: clean laps with the tyre age they
    # were run at, and the stint's own wear slope (fuel added back).
    def age_at(dn: int, ln: int) -> int:
        for st in (state.stints.get(dn) or {}).values():
            a, e = st.get("lap_start") or 1, st.get("lap_end") or 10_000
            if a <= ln <= e:
                return (ln - a + 1) + (st.get("tyre_age_at_start") or 0)
        return ln

    cars = []
    for dn, pos in sorted(state.position.items(), key=lambda kv: kv[1]):
        laps = state.lap_times.get(dn) or {}
        pits = set(state.pit_laps.get(dn, []))
        clean = _clean(laps, neutral | pits | {p + 1 for p in pits})
        if len(clean) < 3:
            continue
        stint = state.current_stint(dn)
        start = stint.get("lap_start") or 1
        raw = _slope([p for p in clean if p[0] >= start])
        cars.append({"dn": dn, "pos": pos, "clean": clean, "stint": stint, "start": start,
                     "wear_raw": None if raw is None else raw + fuel_s_per_lap})
    if not cars:
        base["reason"] = "not enough clean laps yet"
        return base
    measured = [c["wear_raw"] for c in cars if c["wear_raw"] is not None]
    field_wear = min(max(statistics.median(measured), 0.0), WEAR_RANGE[1]) if measured else DEFAULT_WEAR

    # Pass 2 — project. A slope from a handful of laps is mostly noise and,
    # summed over the rest of the race, it decides the result on its own; so
    # each is pulled halfway to the field's and never below zero.
    rows = []
    for c in cars:
        dn, pos, stint, start = c["dn"], c["pos"], c["stint"], c["start"]
        wear = field_wear if c["wear_raw"] is None else min(max(
            field_wear + 0.5 * (c["wear_raw"] - field_wear), 0.0), WEAR_RANGE[1])
        compound = (stint.get("compound") or "").upper()
        age = (lap_now - start + 1) + (stint.get("tyre_age_at_start") or 0)
        # Pace now: each recent clean lap brought to today's fuel and today's
        # tyre age, so a stop a few laps ago does not leave old-tyre laps in it.
        recent = [t - fuel_s_per_lap * (lap_now - ln) + wear * (age - age_at(dn, ln)) for ln, t in c["clean"][-8:]]
        pace = statistics.median(recent)
        spread = statistics.pstdev([t for _, t in c["clean"][-10:]]) if len(c["clean"]) >= 4 else 0.5
        used = {(x.get("compound") or "").upper() for x in (state.stints.get(dn) or {}).values()}
        stops = 0
        if compound not in ("INTERMEDIATE", "WET") and len(used - {""}) < 2:
            stops = 1
        if age + left > MAX_STINT.get(compound, 35) * (1 + stops):
            stops += 1
        gap = state.gap.get(dn, {}).get("gap_to_leader")
        if isinstance(gap, str):          # "+1 LAP"
            n = int("".join(ch for ch in gap if ch.isdigit()) or 1)
            gap = n * pace
        gap = float(gap) if isinstance(gap, (int, float)) else (0.0 if pos == 1 else None)
        if gap is None:
            continue
        # From here each lap adds `wear`; an owed stop resets it — the new set
        # is quicker than now by the age worn off. Fuel burn is the same for
        # everyone and leaves the order alone, so it is not added.
        seg = left / (stops + 1) if left else 0
        wear_time = wear * seg * (seg + 1) / 2 * (stops + 1) - (wear * age * (left - seg) if stops else 0.0)
        rows.append({
            "dn": dn, "pos": pos, "gap": gap, "pace": pace, "spread": max(0.15, min(spread, 1.2)),
            "wear": wear, "stops": stops, "compound": compound or None, "age": age,
            "remaining": left * pace + wear_time + stops * pit_loss,
        })
    if not rows:
        base["reason"] = "not enough clean laps yet"
        return base
    field = statistics.median(r["pace"] for r in rows)
    for r in rows:
        shrunk = field + PACE_SHRINK * (r["pace"] - field)
        r["remaining"] += left * (shrunk - r["pace"])

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
        ranked = _settle(totals, {r["dn"]: r for r in rows})
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


# Qualifying gets quicker as it runs — rubber goes down and the last runs are
# on the lowest fuel and the best tyres. Q1 to Q3 is typically 0.5–1.0 s.
QUALI_EVOLUTION_S = 0.9
QUALI_NOISE_S = 0.22
QUALI_SEGMENTS = (None, 15, 10)        # who may still set a time after each chequered flag


def _chequers(state) -> int:
    return sum(1 for m in state.store["v1/race_control"].values()
               if "CHEQUERED" in (m.get("message") or "").upper() or (m.get("flag") or "").upper() == "CHEQUERED")


def _session_fraction(state) -> float:
    info = getattr(state, "session_info", {}) or {}
    from app.utils.time import parse_utc
    a, b = parse_utc(info.get("date_start")), parse_utc(info.get("date_end"))
    if a and b and b > a:
        now = state.clock()
        return min(max((now - a.timestamp()) / (b - a).total_seconds(), 0.0), 1.0)
    # no schedule (a replay): the laps say how far in we are, over an hour
    starts = [t for laps in state.lap_completed_at.values() for t in laps.values()]
    if len(starts) < 2:
        return 0.0
    return min((max(starts) - min(starts)) / 3600.0, 1.0)


def pole_projection(state, practice_rows: list[dict], rng: random.Random | None = None) -> dict[str, Any]:
    """
    Pole odds. Each simulation gives every driver still in the session one
    more lap: their ideal (best sectors summed) less a share of the evolution
    still to come, plus noise, never worse than what they have already done.
    Qualifying ends at its third chequered flag — Q1 and Q2 end with one each,
    and after each the slowest are out.
    """
    rng = rng or random.Random(len(practice_rows) * 31 + (state.session_key or 0))
    rows = [r for r in practice_rows if r.get("best_lap_s")]
    base: dict[str, Any] = {"kind": "pole", "simulations": SIMULATIONS, "drivers": []}
    quali = state.session_type == "Qualifying"
    flags = _chequers(state)
    scheduled_end_passed = bool((getattr(state, "session_info", {}) or {}).get("date_end")) and _session_fraction(state) >= 1.0
    over = ((flags >= 3) if quali else state.chequered) or scheduled_end_passed
    if over and rows:
        base.update({"final": True, "confidence": "High", "drivers": [{
            "driver_number": r["driver_number"], "code": r["code"], "colour": r.get("colour"),
            "position": r["position"], "win": 1.0 if r["position"] == 1 else 0.0,
            "best_s": r["best_lap_s"], "ideal_s": (r.get("ideal_lap") or {}).get("total"),
        } for r in sorted(rows, key=lambda r: r["position"])]})
        return base
    if len(rows) < 3:
        base["reason"] = "needs at least three timed laps"
        return base
    alive = rows
    if quali and flags:
        keep = QUALI_SEGMENTS[min(flags, 2)]
        alive = sorted(rows, key=lambda r: r["best_lap_s"])[:keep]
    left = 1.0 - _session_fraction(state)
    wins = {r["driver_number"]: 0 for r in rows}
    for _ in range(SIMULATIONS):
        best = None
        for r in alive:
            ideal = (r.get("ideal_lap") or {}).get("total") or r["best_lap_s"]
            attempt = ideal - rng.uniform(0, QUALI_EVOLUTION_S * left) + rng.gauss(0, QUALI_NOISE_S)
            t = min(r["best_lap_s"], attempt)
            if best is None or t < best[1]:
                best = (r["driver_number"], t)
        wins[best[0]] += 1
    out = [{
        "driver_number": r["driver_number"], "code": r["code"], "colour": r.get("colour"),
        "position": r["position"], "win": round(wins[r["driver_number"]] / SIMULATIONS, 3),
        "best_s": r["best_lap_s"], "ideal_s": (r.get("ideal_lap") or {}).get("total"),
    } for r in rows]
    out.sort(key=lambda d: (-d["win"], d["position"]))
    base.update({"drivers": out, "segment": min(flags + 1, 3) if quali else None,
                 "confidence": "Medium" if left < 0.4 else "Low"})
    return base
