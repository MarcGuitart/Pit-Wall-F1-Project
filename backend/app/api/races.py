import json
import logging
from pathlib import Path

from fastapi import APIRouter, Query

from app.clients.openf1_client import OpenF1AuthError, OpenF1Error, OpenF1RateLimitError, fetch_json
from app.core.config import settings
from app.core.errors import AppError
from app.core import cache as race_cache
from typing import Optional

from app.domain.models import RaceListItem, SessionInfo
from app.services.autopublish import (
    EXCLUSIONS_FILE, excluded_meetings, is_cancelled, parse_exclusions,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["races"])

# backend/excluded_sessions.json — the same file autopublish reads.
_EXCLUSIONS_PATH = Path(__file__).resolve().parents[2] / EXCLUSIONS_FILE


def read_exclusions() -> dict | None:
    """The exclusions file, read per request (small, edited by hand); None if
    it is missing or unreadable — nothing is excluded then."""
    try:
        return json.loads(_EXCLUSIONS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


# The versioned session lists (backend/cache in the repo). settings.cache_path is
# this same directory unless CACHE_DIR moves it (app/core/config.py); a list
# missing there is still read from here before asking OpenF1.
_REPO_CACHE = Path(__file__).resolve().parents[2] / "cache"


def _cached_sessions(meeting_key: int) -> list | None:
    """meeting_<k>_sessions.json from the cache directory, else the repo's copy (read only)."""
    rows = race_cache.get_sessions_for_meeting(meeting_key)
    if rows:
        return rows
    repo = _REPO_CACHE / f"meeting_{meeting_key}_sessions.json"
    if repo.resolve() == (settings.cache_path / repo.name).resolve():
        return rows
    try:
        data = json.loads(repo.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return rows
    if isinstance(data, list) and data:
        logger.info("[SESSIONS] meeting %s read from the versioned copy %s", meeting_key, repo)
        return data
    return rows


def _has_meta(rows: list) -> bool:
    """A cached list written before location/is_cancelled existed lacks them;
    such a list is refreshed from OpenF1 once, and served as is if that fails."""
    return all(isinstance(r, dict) and "is_cancelled" in r for r in rows)


class RaceListItemOut(RaceListItem):
    """/races row (block 43), additive: the weekend's end, so the season grid
    can show "29 Feb to 2 Mar 2024". Defined here rather than in
    app/domain/models.py; null when no source has it."""
    date_end: Optional[str] = None


def _weekend_ends_from_cache() -> dict[int, str]:
    """meeting_key → the latest date_end the local cache knows: each cached
    session list (meeting_<k>_sessions.json) and each published session's meta.
    Reads files only, never OpenF1."""
    ends: dict[int, str] = {}

    def keep(key, end):
        if isinstance(key, int) and isinstance(end, str) and end > ends.get(key, ""):
            ends[key] = end

    root = settings.cache_path
    for f in root.glob("meeting_*_sessions.json"):
        try:
            key = int(f.name.split("_")[1])
            for row in json.loads(f.read_text(encoding="utf-8")) or []:
                keep(key, (row or {}).get("date_end"))
        except (ValueError, OSError, json.JSONDecodeError, AttributeError, TypeError):
            continue
    for f in root.glob("*/_session_meta.json"):
        try:
            meta = json.loads(f.read_text(encoding="utf-8"))
            keep(meta.get("meeting_key"), meta.get("date_end"))
        except (OSError, json.JSONDecodeError, AttributeError):
            continue
    return ends


def _races_out(rows: list, ends: dict[int, str] | None = None) -> list[RaceListItemOut]:
    off = excluded_meetings(read_exclusions())
    ends = _weekend_ends_from_cache() if ends is None else ends
    out = [RaceListItemOut(**r) if isinstance(r, dict) else RaceListItemOut(**r.model_dump()) for r in rows]
    for item in out:
        item.is_cancelled = item.is_cancelled is True or item.meeting_key in off
        if not item.date_end:
            item.date_end = ends.get(item.meeting_key)
    return out


def _sessions_out(rows: list) -> list[SessionInfo]:
    off = parse_exclusions(read_exclusions())
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


@router.get("/races", response_model=list[RaceListItemOut])
async def list_races(year: int = Query(default=2024)) -> list[RaceListItemOut]:
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

    # The weekend's end (block 43): one request for the whole season's
    # sessions, never one per meeting; if it fails the list is served without it.
    season_ends: dict[int, str] = {}
    try:
        for row in await fetch_json("sessions", year=year) or []:
            key, end = (row or {}).get("meeting_key"), (row or {}).get("date_end")
            if isinstance(key, int) and isinstance(end, str) and end > season_ends.get(key, ""):
                season_ends[key] = end
    except (OpenF1Error, TypeError, AttributeError):
        pass

    items: list[RaceListItemOut] = []
    for m in meetings:
        if not m.get("meeting_name"):
            continue
        items.append(
            RaceListItemOut(
                meeting_key=m["meeting_key"],
                meeting_name=m.get("meeting_name", ""),
                country_name=m.get("country_name"),
                circuit_short_name=m.get("circuit_short_name"),
                date_start=m.get("date_start"),
                year=m.get("year", year),
                location=m.get("location"),
                is_cancelled=is_cancelled(m),
                date_end=m.get("date_end") or season_ends.get(m["meeting_key"]),
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
    cached = _cached_sessions(meeting_key)
    if cached and _has_meta(cached):
        return _sessions_out(cached)

    try:
        sessions = await fetch_json("sessions", meeting_key=meeting_key)
    except OpenF1AuthError as exc:
        if cached:
            return _sessions_out(cached)
        # Only the sessions that have an analysis on this server: a partial list.
        # Served for this request but never saved as the meeting's list, or every
        # later request would get the same partial answer without asking again.
        fallback = _sessions_from_analysis_cache(meeting_key)
        if fallback:
            logger.warning(
                "[SESSIONS] OpenF1 401 and no session list for meeting %s: serving the %d session(s) "
                "with an analysis, not saved",
                meeting_key, len(fallback),
            )
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
