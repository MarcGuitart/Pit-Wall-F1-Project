"""Race classification — starting grid, finishing order, positions gained.

Both ends come from the position stream: OpenF1 only emits a record when a
driver's position changes, so the earliest event per driver is their grid slot
and the latest is their final classification.

Verified against official F1.com data for 2024 São Paulo (session 9636):
starting grid matches exactly P1-P20 (NOR pole, VER P17), and the finishing
order matches exactly P1-P10.
"""
from __future__ import annotations

from app.domain.models import RaceClassificationRow


def compute_race_classification(
    position_data: list[dict],
    drivers: list[dict],
) -> list[RaceClassificationRow]:
    driver_map = {d["driver_number"]: d for d in drivers if "driver_number" in d}

    earliest_by_driver: dict[int, dict] = {}
    latest_by_driver: dict[int, dict] = {}
    for p in sorted(position_data, key=lambda x: x.get("date") or ""):
        dn = p.get("driver_number")
        if dn:
            if dn not in earliest_by_driver:
                earliest_by_driver[dn] = p
            latest_by_driver[dn] = p

    rows: list[RaceClassificationRow] = []
    for dn, p in latest_by_driver.items():
        d_info = driver_map.get(dn, {})
        grid = earliest_by_driver.get(dn, {}).get("position")
        finish = p.get("position")

        # Positive = places gained (P17 -> P1 is +16), since a lower position
        # number is further up the order.
        gained = grid - finish if grid is not None and finish is not None else None

        rows.append(
            RaceClassificationRow(
                driver_number=dn,
                driver_code=d_info.get("name_acronym", f"D{dn}"),
                team_name=d_info.get("team_name"),
                team_colour=d_info.get("team_colour"),
                grid_position=grid,
                finishing_position=finish,
                positions_gained=gained,
            )
        )

    rows.sort(key=lambda r: r.finishing_position or 999)
    return rows
