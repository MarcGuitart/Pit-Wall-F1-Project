"""
Chaos Index v2 — fraction of the race spent in an altered state.

Every component is a 0-1 measurement of *how much of the race* was affected,
not a count of events, so a 44-lap and a 78-lap race with the same pattern of
incidents score the same and a 1-lap safety car no longer equals an 8-lap one.

    score = Σ weight_c · min(1, raw_c / full_scale_c)          (0-100)

Component        raw measurement                                  full scale   weight
safety_car       (SC laps + VSC_WEIGHT·VSC laps) / total laps     0.25         30
yellow_flags     laps with a local yellow (not under SC/VSC) / total   0.12    10
stewarding       (incidents noted + PENALTY_WEIGHT·penalties) / total laps  0.40  20
weather          wet laps / total laps                            0.75         20
position_volatility  competitive position changes per driver-lap 0.12         20

Full scales are the raw value that earns the full weight; they were set on the
five cached 2023-24 races so that no component saturates in more than one of
them. Thresholds live here too (THRESHOLDS) — the frontend mirrors them in
lib/chaos.ts. METHOD_VERSION changes whenever any of this does.
"""
from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field

from app.domain.models import ChaosComponent, ChaosComponents, ChaosIndex
from app.domain.race_timeline import RaceTimeline
from app.services.weather_conditions import parse_ts

METHOD_VERSION = "2.0"

WEIGHTS: dict[str, int] = {
    "safety_car": 30,
    "yellow_flags": 10,
    "stewarding": 20,
    "weather": 20,
    "position_volatility": 20,
}
FULL_SCALE: dict[str, float] = {
    "safety_car": 0.25,            # a quarter of the race neutralised
    "yellow_flags": 0.12,          # local yellows on 12 % of the laps
    "stewarding": 0.40,            # 0.4 weighted incidents per lap
    "weather": 0.75,               # three quarters of the race wet
    "position_volatility": 0.12,   # 0.12 competitive place changes per driver per lap
}
VSC_WEIGHT = 0.5        # a VSC lap disrupts half as much as an SC lap
PENALTY_WEIGHT = 2      # a penalty counts as its incident plus this much
PIT_WINDOW_LAPS = 3     # laps after a pit stop during which a driver's position is settling

# Level boundaries on the 0-100 score. Calibrated on the same five races:
# 9566 Low · 9539/9197 Medium · 9662 High · 9636 Extreme.
THRESHOLDS: list[tuple[int, str]] = [(55, "Extreme"), (32, "High"), (15, "Medium"), (0, "Low")]

_PENALTY_RE = re.compile(r"(TIME PENALTY|STOP/GO|STOP AND GO|DRIVE.THROUGH)")


def level_for(score: int | float) -> str:
    for floor, name in THRESHOLDS:
        if score >= floor:
            return name
    return "Low"


# ── Components ────────────────────────────────────────────────────────────────

def _component(name: str, raw: float, raw_unit: str, note: str | None = None) -> ChaosComponent:
    full = FULL_SCALE[name]
    normalized = min(1.0, raw / full) if full > 0 else 0.0
    return ChaosComponent(
        raw=round(raw, 4),
        raw_unit=raw_unit,
        normalized=round(normalized, 3),
        full_scale=full,
        weight=WEIGHTS[name],
        points=round(normalized * WEIGHTS[name], 1),
        note=note,
    )


def _safety_car(timeline: RaceTimeline) -> ChaosComponent:
    total = timeline.total_laps or 1
    sc = sum(1 for s in timeline.laps.values() if s.sc_active)
    vsc = sum(1 for s in timeline.laps.values() if s.vsc_active and not s.sc_active)
    weighted = sc + VSC_WEIGHT * vsc
    return _component(
        "safety_car", weighted / total, "neutralised laps / total laps",
        f"{sc} SC lap(s), {vsc} VSC lap(s) (VSC weighted {VSC_WEIGHT}) of {total}; red flags count as SC.",
    )


def _yellow_flags(timeline: RaceTimeline) -> ChaosComponent:
    total = timeline.total_laps or 1
    laps = sum(
        1 for s in timeline.laps.values()
        if s.yellow_active and not s.sc_active and not s.vsc_active
    )
    return _component(
        "yellow_flags", laps / total, "laps with a local yellow / total laps",
        f"{laps} lap(s) with a sector yellow outside SC/VSC of {total}.",
    )


_CAR_RE = re.compile(r"CARS? ((?:\d+(?:\s*\([A-Z]{3}\))?(?:,\s*|\s+AND\s+)?)+)")
_NUM_RE = re.compile(r"\d+")


def _cars_in(txt: str) -> set[int]:
    m = _CAR_RE.search(txt)
    return {int(n) for n in _NUM_RE.findall(m.group(1))} if m else set()


def stewarding_per_lap(race_control: list[dict]) -> dict[int, tuple[int, int]]:
    """
    {lap: (incidents noted, penalties)}. An incident is counted once, when race
    control notes it; 'UNDER INVESTIGATION' and 'NO FURTHER INVESTIGATION'
    are stages of the same incident, not new ones. A penalty is the outcome of
    an incident and is attributed to the lap of the most recent noted incident
    involving the same car (a lap-1 collision sanctioned on lap 5 belongs to
    lap 1); if no such incident exists, to the lap the penalty was issued on.
    Messages without a lap number land on lap 0.
    """
    per_lap: dict[int, list[int]] = defaultdict(lambda: [0, 0])
    last_noted_lap: dict[int, int] = {}          # car number -> lap of its latest noted incident
    for m in sorted(race_control, key=lambda x: x.get("date") or ""):
        txt = (m.get("message") or "").upper()
        lap = m.get("lap_number") or 0
        if " NOTED" in txt:
            per_lap[lap][0] += 1
            for car in _cars_in(txt):
                last_noted_lap[car] = lap
        elif _PENALTY_RE.search(txt) and "NO FURTHER" not in txt:
            cars = _cars_in(txt)
            incident_lap = next((last_noted_lap[c] for c in cars if c in last_noted_lap), lap)
            per_lap[incident_lap][1] += 1
    return {lap: (n, p) for lap, (n, p) in per_lap.items()}


def count_stewarding(race_control: list[dict]) -> tuple[int, int]:
    """(incidents noted, penalties) for the whole session — see stewarding_per_lap."""
    per_lap = stewarding_per_lap(race_control)
    return sum(n for n, _ in per_lap.values()), sum(p for _, p in per_lap.values())


def _stewarding(race_control: list[dict], total_laps: int) -> ChaosComponent:
    noted, penalties = count_stewarding(race_control)
    weighted = noted + PENALTY_WEIGHT * penalties
    return _component(
        "stewarding", weighted / max(total_laps, 1), "weighted incidents per lap",
        f"{noted} incident(s) noted, {penalties} penalt{'y' if penalties == 1 else 'ies'} "
        f"(each penalty weighted {PENALTY_WEIGHT}).",
    )


def _weather(timeline: RaceTimeline) -> ChaosComponent:
    total = timeline.total_laps or 1
    wet = len(timeline.wet_laps())
    return _component("weather", wet / total, "wet laps / total laps", f"{wet} wet lap(s) of {total}.")


@dataclass
class VolatilityStats:
    changes: int = 0
    driver_laps: int = 0
    laps_compared: int = 0
    per_lap: dict[int, int] = field(default_factory=dict)   # competitive changes that happened during each lap


def competitive_position_changes(
    laps: list[dict],
    position_data: list[dict],
    pit_data: list[dict],
    timeline: RaceTimeline,
) -> VolatilityStats:
    """
    Competitive place changes, in total and per lap.

    A change is a driver whose rank among the drivers *compared on that lap*
    differs from the previous lap. Excluded as structural noise, not racing:
    - laps under SC/VSC/red flag (the field is frozen or reshuffled by rule)
    - any driver who pitted in the last PIT_WINDOW_LAPS laps (in-lap, out-lap,
      settling) — and, because ranks are recomputed without them, the places
      other drivers gain from those stops
    - drivers with no lap record on both laps (retired / not yet classified)
    Positions are read at each driver's own lap start.
    """
    starts = {
        (l["driver_number"], l["lap_number"]): parse_ts(l.get("date_start"))
        for l in laps if l.get("driver_number") and l.get("lap_number") and l.get("date_start")
    }
    pos_sorted = sorted(
        (p for p in position_data if p.get("date") and p.get("driver_number") and p.get("position")),
        key=lambda p: p["date"],
    )
    pos_at: dict[int, dict[int, int]] = defaultdict(dict)
    latest: dict[int, int] = {}
    ptr = 0
    for (dn, ln), t in sorted(((k, v) for k, v in starts.items() if v), key=lambda kv: kv[1]):
        while ptr < len(pos_sorted) and parse_ts(pos_sorted[ptr]["date"]) <= t:
            latest[pos_sorted[ptr]["driver_number"]] = pos_sorted[ptr]["position"]
            ptr += 1
        if dn in latest:
            pos_at[ln][dn] = latest[dn]

    pits: dict[int, set[int]] = defaultdict(set)
    for p in pit_data:
        if p.get("driver_number") and p.get("lap_number"):
            pits[p["driver_number"]].add(p["lap_number"])

    neutral = {n for n, s in timeline.laps.items() if s.sc_active or s.vsc_active}

    stats = VolatilityStats()
    for ln in range(2, timeline.total_laps + 1):
        if ln in neutral:
            continue
        prev, curr = pos_at.get(ln - 1, {}), pos_at.get(ln, {})
        window = set(range(ln - PIT_WINDOW_LAPS + 1, ln + 1))
        keep = [dn for dn in curr if dn in prev and not (pits[dn] & window)]
        if len(keep) < 2:
            continue
        rank_prev = {dn: i for i, dn in enumerate(sorted(keep, key=lambda d: prev[d]))}
        rank_curr = {dn: i for i, dn in enumerate(sorted(keep, key=lambda d: curr[d]))}
        lap_changes = sum(1 for dn in keep if rank_prev[dn] != rank_curr[dn])
        stats.changes += lap_changes
        # ranks are read at lap starts, so a difference between the starts of
        # ln-1 and ln happened *during* lap ln-1
        stats.per_lap[ln - 1] = lap_changes
        stats.driver_laps += len(keep)
        stats.laps_compared += 1
    return stats


def _position_volatility(stats: VolatilityStats) -> ChaosComponent:
    rate = stats.changes / stats.driver_laps if stats.driver_laps else 0.0
    return _component(
        "position_volatility", rate, "competitive place changes per driver-lap",
        f"{stats.changes} place change(s) over {stats.driver_laps} driver-laps on {stats.laps_compared} green laps; "
        f"pit cycles ({PIT_WINDOW_LAPS}-lap window) and SC/VSC laps excluded.",
    )


# ── Peak lap ─────────────────────────────────────────────────────────────────

# Per-lap weights of the same altered-state signals the components measure.
PEAK_LAP_WEIGHTS: dict[str, float] = {
    "red_flag": 6.0,       # the race was stopped: the maximum interruption
    "sc": 3.0,             # lap under SC
    "vsc": 1.5,            # lap under VSC (= VSC_WEIGHT · sc)
    "yellow": 1.0,         # local yellow outside SC/VSC
    "noted": 1.0,          # incident noted on that lap
    "penalty": 2.0,        # penalty on that lap (= PENALTY_WEIGHT · noted)
    "wet": 1.0,            # wet lap
    "place_change": 0.25,  # each competitive place change on that lap
}


def peak_chaos_lap(
    timeline: RaceTimeline, race_control: list[dict], volatility: VolatilityStats
) -> int | None:
    """
    Lap with the highest weighted concentration of altered-state signals
    (PEAK_LAP_WEIGHTS). Same inputs as the components: red flag/SC/VSC/yellow/
    wet from the timeline, incidents and penalties as counted by
    count_stewarding. A red flag outranks everything else on its own.
    Place changes during lap 1 (the start) are ignored. Earliest lap wins a
    tie; None if nothing happened at all.
    """
    stewarding = stewarding_per_lap(race_control)
    wet = timeline.wet_laps()
    best_lap, best_score = None, 0.0
    for ln in range(1, timeline.total_laps + 1):
        sig = timeline.laps.get(ln)
        noted, penalties = stewarding.get(ln, (0, 0))
        score = 0.0
        if sig is not None:
            if sig.red_flag:
                score += PEAK_LAP_WEIGHTS["red_flag"]
            elif sig.sc_active:
                score += PEAK_LAP_WEIGHTS["sc"]
            elif sig.vsc_active:
                score += PEAK_LAP_WEIGHTS["vsc"]
            elif sig.yellow_active:
                score += PEAK_LAP_WEIGHTS["yellow"]
        score += PEAK_LAP_WEIGHTS["noted"] * noted + PEAK_LAP_WEIGHTS["penalty"] * penalties
        score += PEAK_LAP_WEIGHTS["wet"] * (ln in wet)
        if ln > 1:   # the start reshuffle is structural, not chaos (v1 excluded lap 1 too)
            score += PEAK_LAP_WEIGHTS["place_change"] * volatility.per_lap.get(ln, 0)
        if score > best_score:
            best_lap, best_score = ln, score
    return best_lap


# ── Entry point ──────────────────────────────────────────────────────────────

def compute_chaos_index(
    timeline: RaceTimeline,
    race_control: list[dict],
    laps: list[dict],
    position_data: list[dict],
    pit_data: list[dict],
) -> ChaosIndex:
    volatility = competitive_position_changes(laps, position_data, pit_data, timeline)
    breakdown: dict[str, ChaosComponent] = {
        "safety_car": _safety_car(timeline),
        "yellow_flags": _yellow_flags(timeline),
        "stewarding": _stewarding(race_control, timeline.total_laps),
        "weather": _weather(timeline),
        "position_volatility": _position_volatility(volatility),
    }
    score = min(100, round(sum(c.points for c in breakdown.values())))
    level = level_for(score)

    parts: list[str] = []
    sc_note = breakdown["safety_car"]
    if sc_note.raw > 0:
        parts.append(f"{round(sc_note.raw * 100)}% of laps neutralised (SC/VSC)")
    if breakdown["yellow_flags"].raw > 0:
        parts.append(f"local yellows on {round(breakdown['yellow_flags'].raw * 100)}% of laps")
    noted, penalties = count_stewarding(race_control)
    if noted or penalties:
        parts.append(f"{noted} incidents noted, {penalties} penalt{'y' if penalties == 1 else 'ies'}")
    if breakdown["weather"].raw > 0:
        parts.append(f"{round(breakdown['weather'].raw * 100)}% of laps wet")
    parts.append(f"{breakdown['position_volatility'].raw:.2f} place changes per driver-lap")
    summary = f"{level} race. " + ", ".join(parts) + "."

    return ChaosIndex(
        score=score,
        level=level,  # type: ignore[arg-type]
        peak_chaos_lap=peak_chaos_lap(timeline, race_control, volatility),
        components=ChaosComponents(**{name: round(c.points) for name, c in breakdown.items()}),
        breakdown=breakdown,
        summary=summary,
        method_version=METHOD_VERSION,
    )
