"""Timestamp-based position lookup utilities.

OpenF1 position data is timestamp-based, NOT lap-number-based.
We use laps.date_start as the temporal anchor for each lap.
"""
from __future__ import annotations


def position_at_lap(
    driver_number: int,
    lap_number: int,
    position_data: list[dict],
    laps_data: list[dict],
) -> int | None:
    """
    Return the racing position of a driver at the START of a given lap.

    Algorithm:
    1. Find the lap record for this driver/lap to get its date_start timestamp.
    2. Among all position records for this driver, find the one with the
       latest date that is <= the lap's date_start.
    3. Return that position value.

    Returns None if no matching data exists.
    """
    driver_laps = [
        l for l in laps_data
        if l.get("driver_number") == driver_number
        and l.get("lap_number") == lap_number
    ]
    if not driver_laps:
        return None

    lap_ts: str | None = driver_laps[0].get("date_start")
    if not lap_ts:
        # date_start can be None for lap 1 — fall back to lap_number order
        all_driver_laps = sorted(
            [l for l in laps_data if l.get("driver_number") == driver_number],
            key=lambda l: l.get("lap_number", 0),
        )
        # For lap 1 with no timestamp, try the very first position record
        driver_positions = [
            p for p in position_data if p.get("driver_number") == driver_number
        ]
        if not driver_positions:
            return None
        earliest = sorted(driver_positions, key=lambda p: p.get("date", ""))[0]
        return earliest.get("position")

    driver_positions = [
        p for p in position_data
        if p.get("driver_number") == driver_number and p.get("date")
    ]
    eligible = [p for p in driver_positions if p["date"] <= lap_ts]
    if not eligible:
        # No earlier record — take the earliest available
        all_sorted = sorted(driver_positions, key=lambda p: p.get("date", ""))
        return all_sorted[0].get("position") if all_sorted else None

    return sorted(eligible, key=lambda p: p["date"])[-1].get("position")


def sc_vsc_laps(race_control: list[dict]) -> set[int]:
    """
    Return the set of lap numbers that are under a Safety Car or Virtual Safety Car.

    Handles the actual OpenF1 message format:
      deploy:  "SAFETY CAR DEPLOYED", "VIRTUAL SAFETY CAR DEPLOYED"
      ending:  "SAFETY CAR IN THIS LAP", "VIRTUAL SAFETY CAR ENDING"
    """
    affected: set[int] = set()
    deploy_lap: int | None = None

    for msg in sorted(race_control, key=lambda m: m.get("date") or ""):
        txt = (msg.get("message") or "").upper()
        lap = msg.get("lap_number")

        is_deploy = (
            "SAFETY CAR DEPLOYED" in txt
            or "VIRTUAL SAFETY CAR DEPLOYED" in txt
        )
        is_ending = (
            "SAFETY CAR IN THIS LAP" in txt
            or "VIRTUAL SAFETY CAR ENDING" in txt
        )

        if is_deploy and lap:
            deploy_lap = lap
            affected.add(lap)
        elif is_ending and deploy_lap and lap:
            # Mark the full SC window including the ending lap
            for l in range(deploy_lap, lap + 2):
                affected.add(l)
            deploy_lap = None
        elif deploy_lap and lap:
            # Still under SC — mark this lap too
            affected.add(lap)

    return affected
