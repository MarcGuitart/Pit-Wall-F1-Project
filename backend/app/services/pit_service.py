"""
Pit stop impact — lane duration, position before/after.

lane_duration is the primary metric (always present in OpenF1 pit data);
stop_duration (stationary time) exists only from USGP 2024 onwards and is
carried as secondary information, never used to filter.

Each stop is typed from the race-control timestamps, not just the lap number:
- racing      — a normal stop; lane time is judged and slow/fast verdicts apply.
                A stop made after 'VIRTUAL SAFETY CAR ENDING' on the VSC lap is
                a racing stop.
- safety_car  — the pit timestamp falls inside an SC/VSC period; the lane time
                is judged like any other, only the position delta is relativised
                (part of it is the neutralisation)
- red_flag    — pitted on a red-flag lap (or a 'lane time' of 10+ minutes);
                tyres changed under suspension. Not a strategic stop.

Position deltas: position_before is read at the start of the stop lap;
position_after at the close of the stop's pit cycle (pit_cycle_service), so a
stop is judged once the rivals around it have stopped too. Red-flag holds keep
the old fixed +3-lap read — their delta is not meaningful either way.
"""
from __future__ import annotations

from app.domain.models import PitCycle, PitImpactRow, StopType
from app.domain.race_timeline import RaceTimeline
from app.services.pit_cycle_service import detect_pit_cycles
from app.services.timeline_builder import NeutralisationPeriod, _build_lap_time_index, neutralisation_periods
from app.services.weather_conditions import parse_ts
from app.utils.time import position_at_lap

RED_FLAG_READ_LAPS = 3    # red-flag holds: position read lap + 3 (no cycle)

SLOW_LANE_S = 26.0        # racing stop slower than this is reported as slow
TARGET_LANE_S = 22.5
RED_FLAG_LANE_S = 600.0   # no pit lane takes 10 min: a 'lane time' this long is a suspension hold


def _net_text(net_change: int | None) -> str:
    if net_change is None:
        return ""
    if net_change > 2:
        return f" Net: +{net_change} positions gained."
    if net_change > 0:
        return f" Net: +{net_change} position."
    if net_change == 0:
        return " Net: no position change."
    return f" Net: {net_change} position{'s' if abs(net_change) > 1 else ''} lost."


def _lane_quality(lane_dur: float | None) -> str | None:
    """Lane time is judged for every stop that happened at racing speed (racing or SC/VSC)."""
    if lane_dur is None:
        return None
    if lane_dur < 21.5:
        return f"Excellent stop ({lane_dur:.1f}s lane, benchmark class)."
    if lane_dur < 23.5:
        return f"Good stop ({lane_dur:.1f}s lane)."
    if lane_dur < SLOW_LANE_S:
        return f"Standard stop ({lane_dur:.1f}s lane, +{lane_dur - TARGET_LANE_S:.1f}s vs target)."
    return f"Slow stop ({lane_dur:.1f}s lane, +{lane_dur - TARGET_LANE_S:.1f}s vs target — costly)."


def _verdict(stop_type: StopType, lane_dur: float | None, net_change: int | None) -> tuple[str, str]:
    """
    (verdict_text, confidence). The lane time is judged the same way whatever
    the flag — 35 s is slow under a VSC too. Only the *position delta* is
    relativised: under SC/VSC part of it is the neutralisation, under a red
    flag it means nothing.
    """
    if stop_type == "red_flag":
        return (
            "Red-flag stop — tyres changed under the suspension, not a strategic stop."
            + _net_text(net_change),
            "Low",
        )

    quality = _lane_quality(lane_dur)
    if quality is None:
        return "No lane timing data available.", "Low"

    if stop_type == "safety_car":
        return (
            quality + " Under SC/VSC — the position delta partly reflects the neutralisation."
            + _net_text(net_change),
            "Medium",
        )
    if net_change is None:
        return quality, "Medium"
    return quality + _net_text(net_change), "High"


def stop_type_for(
    lap: int,
    stop_date: str | None,
    timeline: RaceTimeline | None,
    periods: list[NeutralisationPeriod],
    lane_dur: float | None = None,
) -> StopType:
    # A car that entered the lane just before the red flag is logged on the
    # previous lap with the whole stoppage as lane time.
    if lane_dur is not None and lane_dur >= RED_FLAG_LANE_S:
        return "red_flag"
    sig = timeline.laps.get(lap) if timeline else None
    if sig is not None and sig.red_flag:
        return "red_flag"
    t = parse_ts(stop_date)
    if t is not None and periods:
        # Timestamp decides: inside an SC/VSC period or not, whatever the lap number says
        return "safety_car" if any(p.kind in ("SC", "VSC") and p.contains(t) for p in periods) else "racing"
    # No timestamp: fall back to the lap map
    if sig is not None and (sig.sc_active or sig.vsc_active):
        return "safety_car"
    return "racing"


def is_slow_stop(row: PitImpactRow) -> bool:
    """Any stop at racing speed over SLOW_LANE_S — under SC/VSC too. Red-flag holds are not stops."""
    return row.stop_type != "red_flag" and row.lane_duration is not None and row.lane_duration > SLOW_LANE_S


def compute_pit_impact_with_cycles(
    pit: list[dict],
    position_data: list[dict],
    laps: list[dict],
    drivers: list[dict],
    race_control: list[dict] | None = None,
    timeline: RaceTimeline | None = None,
) -> tuple[list[PitImpactRow], list[PitCycle]]:
    driver_map = {d["driver_number"]: d for d in drivers if "driver_number" in d}
    periods = neutralisation_periods(race_control or [], _build_lap_time_index(laps)) if race_control else []
    rows: list[PitImpactRow] = []

    for stop in pit:
        dn = stop.get("driver_number")
        ln = stop.get("lap_number")
        if not dn or not ln:
            continue
        lane_dur = stop.get("lane_duration")
        stop_type = stop_type_for(ln, stop.get("date"), timeline, periods, lane_dur)
        d_info = driver_map.get(dn, {})
        rows.append(
            PitImpactRow(
                driver_number=dn,
                driver_code=d_info.get("name_acronym", f"D{dn}"),
                lap_number=ln,
                lane_duration=lane_dur,
                stop_duration=stop.get("stop_duration"),
                stop_type=stop_type,
                position_before=position_at_lap(dn, ln, position_data, laps),
                verdict="",
                confidence="Low",
            )
        )
    rows.sort(key=lambda r: r.lap_number)

    # Cycles set cycle_id on the rows; position_after is read at each cycle's close
    cycles = detect_pit_cycles(rows, position_data, laps, drivers, timeline) if timeline else []
    close_by_cycle = {c.cycle_id: c.close_lap for c in cycles}
    for r in rows:
        read_lap = close_by_cycle.get(r.cycle_id) if r.cycle_id else r.lap_number + RED_FLAG_READ_LAPS
        if read_lap is None:
            read_lap = r.lap_number + RED_FLAG_READ_LAPS
        r.position_after = position_at_lap(r.driver_number, read_lap, position_data, laps)
        if r.position_before is not None and r.position_after is not None:
            r.net_position_change = r.position_before - r.position_after   # positive = gained
        r.verdict, r.confidence = _verdict(r.stop_type, r.lane_duration, r.net_position_change)  # type: ignore[assignment]

    return rows, cycles


def compute_pit_impact(
    pit: list[dict],
    position_data: list[dict],
    laps: list[dict],
    drivers: list[dict],
    timeline: RaceTimeline | None = None,
    race_control: list[dict] | None = None,
) -> list[PitImpactRow]:
    return compute_pit_impact_with_cycles(pit, position_data, laps, drivers, race_control, timeline)[0]
