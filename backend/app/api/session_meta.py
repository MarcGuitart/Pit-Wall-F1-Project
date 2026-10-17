"""
GET /sessions/{session_key}/meta — what a page can say about a session before
its analysis exists (Block 27).

The analysis loader's header (GP, season, session, date) and the pages with no
analysis (not published yet, cancelled, not found) need these facts on a
direct visit, a reload or a shared link, when nothing upstream has listed the
calendar. /analysis cannot answer them: it is one request that returns the
whole report or an error, and it can take 30 s on a cold server.

Public, not PRO: these are calendar facts, the same ones /races already gives
anyone. Light: local files first, then one uncached OpenF1 read, memoised in
process for a few minutes. It never writes to the cache — _session_meta.json
belongs to sessions that were actually computed (see analysis._session_probe).
"""
from __future__ import annotations

import logging
import time
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.api.races import read_exclusions
from app.clients.openf1_client import OpenF1Error, fetch_json
from app.core import cache
from app.core.errors import AppError
from app.services.autopublish import is_cancelled, parse_exclusions
from app.utils.time import is_session_historical

logger = logging.getLogger(__name__)

router = APIRouter(tags=["sessions"])

NETWORK_TTL_S = 300.0
_memo: dict[int, tuple[float, dict]] = {}


class SessionMeta(BaseModel):
    session_key: int
    meeting_key: Optional[int] = None
    meeting_name: Optional[str] = None
    # The host city. Prefer it to country_name for naming the GP: OpenF1's
    # country is wrong for at least one 2026 meeting (Kuala Lumpur, "Bahrain").
    location: Optional[str] = None
    circuit_short_name: Optional[str] = None
    country_name: Optional[str] = None
    year: Optional[int] = None
    session_name: Optional[str] = None
    session_type: Optional[str] = None
    date_start: Optional[str] = None
    date_end: Optional[str] = None
    # Same reading as /races and /analysis' SESSION_CANCELLED.
    is_cancelled: bool = False
    # An analysis file is on this server: /analysis will answer from cache.
    analysis_cached: bool = False
    # The historical guard's unlock instant — the earliest /analysis can be
    # computed, not a promise of when it will be published. Null without a date.
    earliest_at: Optional[str] = None


def _from_cache(session_key: int) -> dict | None:
    meta = cache.get_session_meta(session_key)
    if isinstance(meta, dict) and meta:
        return dict(meta)
    analysis = cache.get_full_analysis(session_key)
    race = (analysis or {}).get("race") if isinstance(analysis, dict) else None
    if isinstance(race, dict) and race:
        # The cached analysis names the session but not its calendar slot.
        return {**race, "session_key": session_key}
    return None


async def _from_openf1(session_key: int) -> dict | None:
    hit = _memo.get(session_key)
    if hit and time.monotonic() - hit[0] < NETWORK_TTL_S:
        return dict(hit[1])
    rows = await fetch_json("sessions", session_key=session_key)
    if not rows or not isinstance(rows[0], dict):
        return None
    row = dict(rows[0])
    _memo[session_key] = (time.monotonic(), row)
    return dict(row)


def _meeting_from_calendar(row: dict) -> dict:
    """The meeting's name and city from the cached /races list, if this server has it."""
    year, key = row.get("year"), row.get("meeting_key")
    if not isinstance(year, int) or not isinstance(key, int):
        return {}
    for m in cache.get_meetings(year) or []:
        if isinstance(m, dict) and m.get("meeting_key") == key:
            return m
    return {}


async def _meeting_from_openf1(meeting_key: int) -> dict:
    try:
        rows = await fetch_json("meetings", meeting_key=meeting_key)
    except OpenF1Error as exc:
        logger.info("[META] meeting %s not readable: %s", meeting_key, exc)
        return {}
    return rows[0] if rows and isinstance(rows[0], dict) else {}


@router.get("/sessions/{session_key}/meta", response_model=SessionMeta)
async def session_meta(session_key: int) -> SessionMeta:
    row = _from_cache(session_key)
    if row is None:
        try:
            row = await _from_openf1(session_key)
        except OpenF1Error as exc:
            raise AppError(
                "OPENF1_ERROR", "OpenF1 unreachable while reading this session.",
                status=503, details={**exc.details(), "session_key": session_key},
            ) from exc
    if row is None:
        raise AppError(
            "SESSION_NOT_FOUND", f"No session {session_key} in OpenF1.",
            status=404, details={"session_key": session_key},
        )

    if not row.get("date_start") and isinstance(row.get("meeting_key"), int):
        for listed in cache.get_sessions_for_meeting(row["meeting_key"]) or []:
            if isinstance(listed, dict) and listed.get("session_key") == session_key:
                row = {**listed, **{k: v for k, v in row.items() if v is not None}}
                break

    meeting = _meeting_from_calendar(row)
    if not meeting.get("meeting_name") and not row.get("meeting_name") and isinstance(row.get("meeting_key"), int):
        meeting = await _meeting_from_openf1(row["meeting_key"])

    earliest = None
    if row.get("date_start"):
        try:
            _, unlock = is_session_historical(row["date_start"], row.get("session_type") or "Race", row.get("date_end"))
            earliest = unlock.isoformat()
        except (TypeError, ValueError):
            earliest = None

    cancelled = session_key in parse_exclusions(read_exclusions()) or is_cancelled(row)
    return SessionMeta(
        session_key=session_key,
        meeting_key=row.get("meeting_key") or meeting.get("meeting_key"),
        meeting_name=row.get("meeting_name") or meeting.get("meeting_name"),
        location=row.get("location") or meeting.get("location"),
        circuit_short_name=row.get("circuit_short_name") or meeting.get("circuit_short_name"),
        country_name=row.get("country_name") or meeting.get("country_name"),
        year=row.get("year") or meeting.get("year"),
        session_name=row.get("session_name"),
        session_type=row.get("session_type"),
        date_start=row.get("date_start"),
        date_end=row.get("date_end"),
        is_cancelled=cancelled,
        analysis_cached=cache.has_full_analysis(session_key),
        earliest_at=earliest,
    )
