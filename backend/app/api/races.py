import json
import logging
from pathlib import Path

from fastapi import APIRouter, Query

from app.clients.openf1_client import OpenF1AuthError, OpenF1Error, OpenF1RateLimitError, fetch_json
from app.core.config import settings
from app.core.errors import AppError
from app.core import cache as race_cache
from app.domain.models import RaceListItem, SessionInfo
from app.services.autopublish import (
    EXCLUSIONS_FILE, excluded_meetings, is_cancelled, parse_exclusions,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["races"])

# backend/excluded_sessions.json — the same file autopublish reads.
_EXCLUSIONS_PATH = Path(__file__).resolve().parents[2] / EXCLUSIONS_FILE


def _exclusions() -> dict | None:
    """The exclusions file, read per request (small, edited by hand); None if
    it is missing or unreadable — nothing is excluded then."""
    try:
        return json.loads(_EXCLUSIONS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _has_meta(rows: list) -> bool:
    """A cached list written before location/is_cancelled existed lacks them;
    such a list is refreshed from OpenF1 once, and served as is if that fails."""
    return all(isinstance(r, dict) and "is_cancelled" in r for r in rows)


def _races_out(rows: list) -> list[RaceListItem]:
    off = excluded_meetings(_exclusions())
    out = [RaceListItem(**r) if isinstance(r, dict) else r for r in rows]
    for item in out:
        item.is_cancelled = item.is_cancelled is True or item.meeting_key in off
    return out


def _sessions_out(rows: list) -> list[SessionInfo]:
    off = parse_exclusions(_exclusions())
    out = [SessionInfo(**r) if isinstance(r, dict) else r for r in rows]
    for item in out:
        item.is_cancelled = item.is_cancelled is True or item.session_key in off
    return out


def _openf1_error(exc: OpenF1Error, what: str, **extra) -> AppError:
    """Map a client error to our envelope; 429 keeps its own code."""
    details = {**exc.details(), **extra}
    if isinstance(exc, OpenF1RateLimitError):
        return AppError(
            "OPENF1_RATE_LIMIT", "OpenF1 is rate-limiting requests. Retry in a minute.",
            status=429, details=details,
        )
    if isinstance(exc, OpenF1AuthError):
        return AppError(
            "OPENF1_UNAUTHORIZED", f"OpenF1 requires a valid API token to {what}.",
            status=503, details=details,
        )
    return AppError("OPENF1_ERROR", f"OpenF1 unreachable while {what}.", status=503, details=details)


@router.get("/races", response_model=list[RaceListItem])
async def list_races(year: int = Query(default=2024)) -> list[RaceListItem]:
    # Fast path: serve any cached season list immediately. This keeps the UI
    # stable when OpenF1 has a transient failure and avoids hard-coded season
    # cutoffs becoming stale.
    cached = race_cache.get_meetings(year)
    if cached and _has_meta(cached):
        return _races_out(cached)  # already sorted list[RaceListItem] dicts

    try:
        meetings = await fetch_json("meetings", year=year)
    except OpenF1Error as exc:
        if cached:
            return _races_out(cached)
        raise _openf1_error(exc, f"listing {year} races", year=year) from exc

    items: list[RaceListItem] = []
    for m in meetings:
        if not m.get("meeting_name"):
            continue
        items.append(
            RaceListItem(
                meeting_key=m["meeting_key"],
                meeting_name=m.get("meeting_name", ""),
                country_name=m.get("country_name"),
                circuit_short_name=m.get("circuit_short_name"),
                date_start=m.get("date_start"),
                year=m.get("year", year),
                location=m.get("location"),
                is_cancelled=is_cancelled(m),
            )
        )

    sorted_items = sorted(items, key=lambda x: x.date_start or "", reverse=True)

    # Persist successful results for future calls.
    if sorted_items:
        race_cache.set_meetings(year, [i.model_dump() for i in sorted_items])
    elif cached:
        return _races_out(cached)

    return _races_out(sorted_items)


def _sessions_from_analysis_cache(meeting_key: int) -> list[SessionInfo]:
    """
    Scan the on-disk session cache for any session whose _session_meta.json
    or _analysis.json references the given meeting_key. Used as a fallback
    when OpenF1 returns 401 and the session-list file doesn't exist yet.
    """
    cache_dir = settings.cache_path
    results: list[SessionInfo] = []
    for d in cache_dir.iterdir():
        if not d.is_dir():
            continue
        meta_file = d / "_session_meta.json"
        if meta_file.exists():
            try:
                meta = json.loads(meta_file.read_text())
                if meta.get("meeting_key") == meeting_key:
                    results.append(SessionInfo(
                        session_key=meta["session_key"],
                        session_name=meta.get("session_name", ""),
                        session_type=meta.get("session_type", ""),
                        date_start=meta.get("date_start"),
                        date_end=meta.get("date_end"),
                        location=meta.get("location"),
                        is_cancelled=is_cancelled(meta),
                    ))
                continue
            except Exception:
                pass
        analysis_file = d / "_analysis.json"
        if analysis_file.exists():
            try:
                data = json.loads(analysis_file.read_text())
                race = data.get("race", {})
                if race.get("meeting_key") == meeting_key:
                    results.append(SessionInfo(
                        session_key=race.get("session_key", int(d.name)),
                        session_name=race.get("session_name", ""),
                        session_type=race.get("session_name", ""),
                        date_start=race.get("date_start"),
                    ))
            except Exception:
                pass
    return results


@router.get("/races/{meeting_key}/sessions", response_model=list[SessionInfo])
async def list_sessions(meeting_key: int) -> list[SessionInfo]:
    cached = race_cache.get_sessions_for_meeting(meeting_key)
    if cached and _has_meta(cached):
        return _sessions_out(cached)

    try:
        sessions = await fetch_json("sessions", meeting_key=meeting_key)
    except OpenF1AuthError as exc:
        if cached:
            return _sessions_out(cached)
        fallback = _sessions_from_analysis_cache(meeting_key)
        if fallback:
            logger.info(
                "[SESSIONS] OpenF1 401 — serving %d session(s) from analysis cache for meeting %s",
                len(fallback), meeting_key,
            )
            race_cache.set_sessions_for_meeting(meeting_key, [s.model_dump() for s in fallback])
            return _sessions_out(fallback)
        raise AppError(
            "SESSION_NOT_CACHED",
            "No sessions for this meeting are in the demo cache, and listing "
            "them from OpenF1 requires an API token.",
            status=404,
            details={"meeting_key": meeting_key},
        ) from exc
    except OpenF1Error as exc:
        if cached:
            return _sessions_out(cached)
        raise _openf1_error(exc, "listing sessions", meeting_key=meeting_key) from exc

    result = [
        SessionInfo(
            session_key=s["session_key"],
            session_name=s.get("session_name", ""),
            session_type=s.get("session_type", ""),
            date_start=s.get("date_start"),
            date_end=s.get("date_end"),
            location=s.get("location"),
            is_cancelled=is_cancelled(s),
        )
        for s in sessions
    ]

    if result:
        race_cache.set_sessions_for_meeting(meeting_key, [s.model_dump() for s in result])
    elif cached:
        return _sessions_out(cached)

    return _sessions_out(result)
