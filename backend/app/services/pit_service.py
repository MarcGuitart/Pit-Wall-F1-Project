"""
Pit stop impact — lane duration, position before/after.

lane_duration is the primary metric (always present in OpenF1 pit data);
stop_duration (stationary time) exists only from USGP 2024 onwards and is
carried as secondary information, never used to filter.

Each stop is typed from the race timeline:
- racing      — a normal stop; lane time is judged and slow/fast verdicts apply
- safety_car  — pitted on a lap under SC/VSC; a cheap stop whose position
                delta partly reflects the neutralisation, so lane time is not judged
- red_flag    — pitted on a red-flag lap; tyres changed under suspension, the
                'lane time' is the length of the stoppage. Not a strategic stop.
"""
from __future__ import annotations

from app.domain.models import PitImpactRow, StopType
from app.domain.race_timeline import RaceTimeline
from app.utils.time import position_at_lap

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


def _verdict(stop_type: StopType, lane_dur: float | None, net_change: int | None) -> tuple[str, str]:
    """Return (verdict_text, confidence)."""
    if stop_type == "red_flag":
        return (
            "Red-flag stop — tyres changed under the suspension, not a strategic stop."
            + _net_text(net_change),
            "Low",
        )
    if stop_type == "safety_car":
        lane = f" ({lane_dur:.1f}s lane)" if lane_dur is not None else ""
        return (
            f"Stop under SC/VSC{lane} — cheap stop; position delta partly reflects the neutralisation."
            + _net_text(net_change),
            "Medium",
        )

    if lane_dur is None:
        return "No lane timing data available.", "Low"

    if lane_dur < 21.5:
        quality = f"Excellent stop ({lane_dur:.1f}s lane, benchmark class)."
    elif lane_dur < 23.5:
        quality = f"Good stop ({lane_dur:.1f}s lane)."
    elif lane_dur < SLOW_LANE_S:
        quality = f"Standard stop ({lane_dur:.1f}s lane, +{lane_dur - TARGET_LANE_S:.1f}s vs target)."
    else:
        quality = f"Slow stop ({lane_dur:.1f}s lane, +{lane_dur - TARGET_LANE_S:.1f}s vs target — costly)."

    if net_change is None:
        return quality, "Medium"
    return quality + _net_text(net_change), "High"


def stop_type_for_lap(lap: int, timeline: RaceTimeline | None, lane_dur: float | None = None) -> StopType:
    # A car that entered the lane just before the red flag is logged on the
    # previous lap with the whole stoppage as lane time.
    if lane_dur is not None and lane_dur >= RED_FLAG_LANE_S:
        return "red_flag"
    sig = timeline.laps.get(lap) if timeline else None
    if sig is None:
        return "racing"
    if sig.red_flag:
        return "red_flag"
    if sig.sc_active or sig.vsc_active:
        return "safety_car"
    return "racing"


def is_slow_stop(row: PitImpactRow) -> bool:
    """A racing stop over SLOW_LANE_S. SC/red-flag stops are never 'slow'."""
    return row.stop_type == "racing" and row.lane_duration is not None and row.lane_duration > SLOW_LANE_S


def compute_pit_impact(
    pit: list[dict],
    position_data: list[dict],
    laps: list[dict],
    drivers: list[dict],
    timeline: RaceTimeline | None = None,
) -> list[PitImpactRow]:
    driver_map = {d["driver_number"]: d for d in drivers if "driver_number" in d}
    rows: list[PitImpactRow] = []

    for stop in pit:
        dn = stop.get("driver_number")
        ln = stop.get("lap_number")
        if not dn or not ln:
            continue

        lane_dur = stop.get("lane_duration")
        stop_dur = stop.get("stop_duration")
        stop_type = stop_type_for_lap(ln, timeline, lane_dur)

        # Position snapshot: 1 lap before pit, 3 laps after (let traffic clear)
        pos_before = position_at_lap(dn, ln - 1, position_data, laps)
        pos_after = position_at_lap(dn, ln + 3, position_data, laps)

        net_change: int | None = None
        if pos_before is not None and pos_after is not None:
            # positive = gained positions (smaller position number = higher up)
            net_change = pos_before - pos_after

        verdict_txt, conf = _verdict(stop_type, lane_dur, net_change)
        d_info = driver_map.get(dn, {})

        rows.append(
            PitImpactRow(
                driver_number=dn,
                driver_code=d_info.get("name_acronym", f"D{dn}"),
                lap_number=ln,
                lane_duration=lane_dur,
                stop_duration=stop_dur,
                stop_type=stop_type,
                position_before=pos_before,
                position_after=pos_after,
                net_position_change=net_change,
                verdict=verdict_txt,
                confidence=conf,  # type: ignore[arg-type]
            )
        )

    return sorted(rows, key=lambda r: r.lap_number)
