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


def count_stewarding(race_control: list[dict]) -> tuple[int, int]:
    """
    (incidents noted, penalties). An incident is counted once, when race
    control notes it; 'UNDER INVESTIGATION' and 'NO FURTHER INVESTIGATION'
    are stages of the same incident, not new ones. Penalties are the outcome.
    """
    noted = 0
    penalties = 0
    for m in race_control:
        txt = (m.get("message") or "").upper()
        if " NOTED" in txt:
            noted += 1
        elif _PENALTY_RE.search(txt) and "NO FURTHER" not in txt:
            penalties += 1
    return noted, penalties


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


def competitive_position_changes(
    laps: list[dict],
    position_data: list[dict],
    pit_data: list[dict],
    timeline: RaceTimeline,
) -> tuple[int, int, int]:
    """
    (changes, driver-laps compared, laps compared).

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

    changes = driver_laps = laps_compared = 0
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
        changes += sum(1 for dn in keep if rank_prev[dn] != rank_curr[dn])
        driver_laps += len(keep)
        laps_compared += 1
    return changes, driver_laps, laps_compared


def _position_volatility(
    laps: list[dict], position_data: list[dict], pit_data: list[dict], timeline: RaceTimeline
) -> ChaosComponent:
    changes, driver_laps, laps_compared = competitive_position_changes(laps, position_data, pit_data, timeline)
    rate = changes / driver_laps if driver_laps else 0.0
    return _component(
        "position_volatility", rate, "competitive place changes per driver-lap",
        f"{changes} place change(s) over {driver_laps} driver-laps on {laps_compared} green laps; "
        f"pit cycles ({PIT_WINDOW_LAPS}-lap window) and SC/VSC laps excluded.",
    )


# ── Peak lap (unchanged from v1) ─────────────────────────────────────────────

def _peak_chaos_lap(race_control: list[dict]) -> int | None:
    """
    Lap with the highest concentration of impactful race-control events.
    Exclude lap 1 (pre-race messages inflate it) and laps with only minor events.
    """
    lap_events: dict[int, int] = defaultdict(int)
    for m in race_control:
        ln = m.get("lap_number")
        if not ln or ln <= 1:
            continue
        txt = (m.get("message") or "").upper()
        if any(
            kw in txt
            for kw in ("SAFETY", "YELLOW", "INVESTIGATION", "PENALTY", "VIRTUAL")
        ):
            lap_events[ln] += 1
    if not lap_events:
        return None
    return max(lap_events, key=lap_events.__getitem__)


# ── Entry point ──────────────────────────────────────────────────────────────

def compute_chaos_index(
    timeline: RaceTimeline,
    race_control: list[dict],
    laps: list[dict],
    position_data: list[dict],
    pit_data: list[dict],
) -> ChaosIndex:
    breakdown: dict[str, ChaosComponent] = {
        "safety_car": _safety_car(timeline),
        "yellow_flags": _yellow_flags(timeline),
        "stewarding": _stewarding(race_control, timeline.total_laps),
        "weather": _weather(timeline),
        "position_volatility": _position_volatility(laps, position_data, pit_data, timeline),
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
        peak_chaos_lap=_peak_chaos_lap(race_control),
        components=ChaosComponents(**{name: round(c.points) for name, c in breakdown.items()}),
        breakdown=breakdown,
        summary=summary,
        method_version=METHOD_VERSION,
    )
