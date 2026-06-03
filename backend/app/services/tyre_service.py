"""Tyre degradation slope calculation per stint."""
from __future__ import annotations

from app.domain.models import TyreDegradationRow
from app.utils.statistics import linear_slope, confidence_from_sample, cliff_risk_from_slope
from app.utils.time import sc_vsc_laps


def compute_tyre_degradation(
    laps: list[dict],
    stints: list[dict],
    race_control: list[dict],
    drivers: list[dict],
) -> list[TyreDegradationRow]:
    driver_map = {d["driver_number"]: d for d in drivers if "driver_number" in d}
    neutralised = sc_vsc_laps(race_control)

    laps_by_driver: dict[int, dict[int, dict]] = {}
    for lap in laps:
        dn = lap.get("driver_number")
        ln = lap.get("lap_number")
        if dn and ln:
            laps_by_driver.setdefault(dn, {})[ln] = lap

    rows: list[TyreDegradationRow] = []

    for stint in stints:
        dn = stint.get("driver_number")
        compound = (stint.get("compound") or "UNKNOWN").upper()
        lap_start = stint.get("lap_start") or 1
        lap_end = stint.get("lap_end") or lap_start
        stint_number = stint.get("stint_number") or 1
        tyre_age = stint.get("tyre_age_at_start")

        if not dn or compound in ("UNKNOWN", "", "NONE"):
            continue

        d_info = driver_map.get(dn, {})
        driver_laps_map = laps_by_driver.get(dn, {})

        xs: list[float] = []
        ys: list[float] = []

        for ln in range(lap_start, lap_end + 1):
            lap = driver_laps_map.get(ln)
            if not lap:
                continue
            dur = lap.get("lap_duration")
            if not dur or lap.get("is_pit_out_lap") or ln in neutralised:
                continue
            xs.append(float(ln - lap_start))
            ys.append(dur)

        if len(xs) < 3:
            continue

        slope = linear_slope(xs, ys)
        n = len(xs)
        cliff = cliff_risk_from_slope(slope)
        conf = confidence_from_sample(n)

        rows.append(
            TyreDegradationRow(
                driver_number=dn,
                driver_code=d_info.get("name_acronym", f"D{dn}"),
                compound=compound,
                stint_number=stint_number,
                lap_start=lap_start,
                lap_end=lap_end,
                tyre_age_start=tyre_age,
                degradation_slope=round(slope, 4),
                cliff_risk=cliff,  # type: ignore[arg-type]
                confidence=conf,  # type: ignore[arg-type]
            )
        )

    return rows
