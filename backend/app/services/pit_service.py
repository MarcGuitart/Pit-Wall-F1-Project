"""Pit stop impact — lane duration, position before/after."""
from __future__ import annotations

from app.domain.models import PitImpactRow
from app.utils.time import position_at_lap


def _verdict(lane_dur: float | None, net_change: int | None) -> tuple[str, str]:
    """Return (verdict_text, confidence)."""
    if lane_dur is None:
        return "No lane timing data available.", "Low"

    if lane_dur < 21.5:
        quality = f"Excellent stop ({lane_dur:.1f}s lane, benchmark class)."
    elif lane_dur < 23.5:
        quality = f"Good stop ({lane_dur:.1f}s lane)."
    elif lane_dur < 26.0:
        quality = f"Standard stop ({lane_dur:.1f}s lane, +{lane_dur - 22.5:.1f}s vs target)."
    else:
        quality = f"Slow stop ({lane_dur:.1f}s lane, +{lane_dur - 22.5:.1f}s vs target — costly)."

    if net_change is None:
        return quality, "Medium"
    if net_change > 2:
        pos_txt = f" Net: +{net_change} positions gained."
    elif net_change > 0:
        pos_txt = f" Net: +{net_change} position."
    elif net_change == 0:
        pos_txt = " Net: no position change."
    else:
        pos_txt = f" Net: {net_change} position{'s' if abs(net_change) > 1 else ''} lost."

    return quality + pos_txt, "High"


def compute_pit_impact(
    pit: list[dict],
    position_data: list[dict],
    laps: list[dict],
    drivers: list[dict],
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

        # Position snapshot: 1 lap before pit, 3 laps after (let traffic clear)
        pos_before = position_at_lap(dn, ln - 1, position_data, laps)
        pos_after = position_at_lap(dn, ln + 3, position_data, laps)

        net_change: int | None = None
        if pos_before is not None and pos_after is not None:
            # positive = gained positions (smaller position number = higher up)
            net_change = pos_before - pos_after

        verdict_txt, conf = _verdict(lane_dur, net_change)
        d_info = driver_map.get(dn, {})

        rows.append(
            PitImpactRow(
                driver_number=dn,
                driver_code=d_info.get("name_acronym", f"D{dn}"),
                lap_number=ln,
                lane_duration=lane_dur,
                stop_duration=stop_dur,
                position_before=pos_before,
                position_after=pos_after,
                net_position_change=net_change,
                verdict=verdict_txt,
                confidence=conf,  # type: ignore[arg-type]
            )
        )

    return sorted(rows, key=lambda r: r.lap_number)
