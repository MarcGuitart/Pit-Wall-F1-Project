"""Race classification — actual finishing order, independent of True Pace.

Derived from each driver's last recorded position event. OpenF1's position
endpoint only emits a new record when a driver's position changes, so the
last event per driver already holds their position at the point their order
stopped changing — which is their final classification once the race ends.
Verified against the official F1.com result for 2024 São Paulo (session 9636):
exact match, P1 through P10.
"""
from __future__ import annotations

from app.domain.models import RaceClassificationRow


def compute_race_classification(
    position_data: list[dict],
    drivers: list[dict],
) -> list[RaceClassificationRow]:
    driver_map = {d["driver_number"]: d for d in drivers if "driver_number" in d}

    latest_by_driver: dict[int, dict] = {}
    for p in sorted(position_data, key=lambda x: x.get("date") or ""):
        dn = p.get("driver_number")
        if dn:
            latest_by_driver[dn] = p

    rows: list[RaceClassificationRow] = []
    for dn, p in latest_by_driver.items():
        d_info = driver_map.get(dn, {})
        rows.append(
            RaceClassificationRow(
                driver_number=dn,
                driver_code=d_info.get("name_acronym", f"D{dn}"),
                team_name=d_info.get("team_name"),
                team_colour=d_info.get("team_colour"),
                finishing_position=p.get("position"),
            )
        )

    rows.sort(key=lambda r: r.finishing_position or 999)
    return rows
