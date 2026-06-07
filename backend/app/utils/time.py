"""Timestamp-based position lookup utilities.

OpenF1 position data is timestamp-based, NOT lap-number-based.
We use laps.date_start as the temporal anchor for each lap.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta


# ── Historical session guard ───────────────────────────────────────────────

SESSION_DURATION_ESTIMATE: dict[str, timedelta] = {
    "Race": timedelta(hours=3),
    "Qualifying": timedelta(hours=2),
    "Practice": timedelta(hours=1, minutes=30),
    "Sprint Qualifying": timedelta(hours=1),
    "Sprint": timedelta(hours=1, minutes=30),
}

LIVE_WINDOW_BUFFER = timedelta(minutes=30)


def estimate_session_end(date_start: str, session_type: str) -> datetime:
    start = datetime.fromisoformat(date_start.replace("Z", "+00:00"))
    duration = SESSION_DURATION_ESTIMATE.get(session_type, timedelta(hours=3))
    return start + duration


def is_session_historical(date_start: str, session_type: str) -> tuple[bool, datetime]:
    """
    Returns (is_historical, unlock_at).
    Historical = now > estimated_end + 30min buffer.
    """
    unlock_at = estimate_session_end(date_start, session_type) + LIVE_WINDOW_BUFFER
    now = datetime.now(timezone.utc)
    return now >= unlock_at, unlock_at


# ── Position lookup ────────────────────────────────────────────────────────

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
            for l in range(deploy_lap, lap + 2):
                affected.add(l)
            deploy_lap = None
        elif deploy_lap and lap:
            affected.add(lap)

    return affected
