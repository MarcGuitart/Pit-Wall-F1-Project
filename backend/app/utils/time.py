"""Timestamp-based position lookup utilities.

OpenF1 position data is timestamp-based, NOT lap-number-based.
We use laps.date_start as the temporal anchor for each lap.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

from app.core.config import settings


# ── Historical session guard ───────────────────────────────────────────────
#
# A session is "historical" once OpenF1 has had time to publish its final data.
# OpenF1's session metadata carries date_end, so use it: the per-type durations
# below are only a fallback for metadata that lacks it. They are deliberately
# generous (a Race is 3 h) and using them when date_end exists locks a
# two-hour race for 90 minutes longer than necessary.

SESSION_DURATION_ESTIMATE: dict[str, timedelta] = {
    "Race": timedelta(hours=3),
    "Qualifying": timedelta(hours=2),
    "Practice": timedelta(hours=1, minutes=30),
    "Practice 1": timedelta(hours=1, minutes=30),
    "Practice 2": timedelta(hours=1, minutes=30),
    "Practice 3": timedelta(hours=1, minutes=30),
    "Sprint Qualifying": timedelta(hours=1),
    "Sprint": timedelta(hours=1, minutes=30),
}

# How long after the session actually ends before the analysis is allowed.
# Override with SESSION_UNLOCK_BUFFER_MINUTES.
DEFAULT_UNLOCK_BUFFER = timedelta(minutes=30)
LIVE_WINDOW_BUFFER = DEFAULT_UNLOCK_BUFFER      # kept: older callers import this name


def unlock_buffer() -> timedelta:
    """The configured post-session buffer."""
    minutes = getattr(settings, "session_unlock_buffer_minutes", None)
    return timedelta(minutes=minutes) if minutes is not None else DEFAULT_UNLOCK_BUFFER


def _parse(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def session_end(
    date_start: str, session_type: str, date_end: str | None = None
) -> tuple[datetime, str]:
    """
    (end_of_session, source) where source is "published" when OpenF1 gave a
    usable date_end and "estimated" when the per-type duration was used.
    """
    published = _parse(date_end)
    if published is not None:
        return published, "published"
    start = _parse(date_start)
    if start is None:
        raise ValueError("neither date_end nor a parsable date_start")
    return start + SESSION_DURATION_ESTIMATE.get(session_type, timedelta(hours=3)), "estimated"


def estimate_session_end(date_start: str, session_type: str) -> datetime:
    """Fallback estimate only; prefer session_end(), which honours date_end."""
    return session_end(date_start, session_type)[0]


def is_session_historical(
    date_start: str, session_type: str, date_end: str | None = None
) -> tuple[bool, datetime]:
    """
    Returns (is_historical, unlock_at). unlock_at is the real date_end plus the
    configured buffer when OpenF1 published one, otherwise the per-type estimate
    plus the same buffer.
    """
    end, _source = session_end(date_start, session_type, date_end)
    unlock_at = end + unlock_buffer()
    return datetime.now(timezone.utc) >= unlock_at, unlock_at


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
