"""
GET /sessions/{session_key}/meta — what a page can say about a session before
its analysis exists (Block 27).

The analysis loader's header (GP, season, session, date) and the pages with no
analysis (not published yet, cancelled, not found) need these facts on a
direct visit, a reload or a shared link, when nothing upstream has listed the
calendar. /analysis cannot answer them: it is one request that returns the
whole report or an error, and it can take 30 s on a cold server.

Public, not PRO: these are calendar facts, the same ones /races already gives
anyone. It never writes to the cache — _session_meta.json belongs to sessions
that were actually computed (see analysis._session_probe).

Cold path (Block 27b). A session this server has on disk is answered from disk
and never touches the network. Any other session costs OpenF1 reads (sessions,
and meetings for the name when the cached calendar does not have it), and the
endpoint is public, so that path is guarded three ways:
  - a bounded in-memory memo with TTL: an answer for NETWORK_TTL_S, "no such
    session" for NOT_FOUND_TTL_S; failures are not memoised;
  - one flight per session_key: concurrent askers await the same reads;
  - a limit per IP on the requests that start a flight (memo hits and joins
    are free): COLD_LIMIT_PER_IP per COLD_WINDOW_S, then RATE_LIMITED 429.
"""
from __future__ import annotations

import asyncio
import logging
import time
from collections import OrderedDict
from typing import Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.api.races import read_exclusions
from app.clients.openf1_client import OpenF1Error, fetch_json
from app.core import cache
from app.core.errors import AppError
from app.core.ratelimit import SlidingWindow
from app.services.autopublish import is_cancelled, parse_exclusions
from app.utils.time import is_session_historical

logger = logging.getLogger(__name__)

router = APIRouter(tags=["sessions"])

NETWORK_TTL_S = 300.0
NOT_FOUND_TTL_S = 60.0
MEMO_MAX = 512
COLD_LIMIT_PER_IP = 20
COLD_WINDOW_S = 60.0

_NOT_FOUND = object()


class _Memo:
    """session_key → (expiry, row | _NOT_FOUND), least recently used dropped past MEMO_MAX."""

    def __init__(self, clock=time.monotonic) -> None:
        self.clock = clock
        self._items: OrderedDict[int, tuple[float, object]] = OrderedDict()

    def get(self, key: int):
        hit = self._items.get(key)
        if hit is None:
            return None
        expires, value = hit
        if self.clock() >= expires:
            del self._items[key]
            return None
        self._items.move_to_end(key)
        return value

    def put(self, key: int, value: object, ttl: float) -> None:
        self._items[key] = (self.clock() + ttl, value)
        self._items.move_to_end(key)
        while len(self._items) > MEMO_MAX:
            self._items.popitem(last=False)

    def __len__(self) -> int:
        return len(self._items)

    def clear(self) -> None:
        self._items.clear()


_memo = _Memo()
_flights: dict[int, asyncio.Task] = {}
_cold_limiter = SlidingWindow(COLD_LIMIT_PER_IP, COLD_WINDOW_S)


def _reset_for_tests() -> None:
    _memo.clear()
    _flights.clear()
    _cold_limiter.reset()


def _client_ip(request: Request) -> str:
    # Render terminates TLS in front of us; the first X-Forwarded-For entry is the caller.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


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


async def _resolve_cold(session_key: int) -> dict | None:
    """Every OpenF1 read a cold session needs, in one place: the row, and the
    meeting's name when the cached calendar does not have it."""
    rows = await fetch_json("sessions", session_key=session_key)
    if not rows or not isinstance(rows[0], dict):
        return None
    row = dict(rows[0])
    # Local only: a cold row already carries the meeting's fields (_resolve_cold),
    # and a row read from disk must never cost a network call.
    meeting = _meeting_from_calendar(row)
    for field in ("meeting_name", "location", "circuit_short_name", "country_name", "year"):
        if not row.get(field) and meeting.get(field):
            row[field] = meeting[field]
    return row


def _settle(session_key: int, task: asyncio.Task) -> None:
    if _flights.get(session_key) is task:
        del _flights[session_key]
    if task.cancelled():
        return
    if task.exception() is not None:
        return  # failures are not memoised: the next asker tries again
    row = task.result()
    if row is None:
        _memo.put(session_key, _NOT_FOUND, NOT_FOUND_TTL_S)
    else:
        _memo.put(session_key, row, NETWORK_TTL_S)


async def _from_openf1(session_key: int, ip: str) -> dict | None:
    hit = _memo.get(session_key)
    if hit is _NOT_FOUND:
        return None
    if hit is not None:
        return dict(hit)  # type: ignore[arg-type]
    task = _flights.get(session_key)
    if task is None or task.done():
        wait = _cold_limiter.retry_after(ip)
        if wait > 0:
            retry_after = int(wait) + 1
            raise AppError(
                "RATE_LIMITED",
                f"Too many lookups of sessions this server does not have. Try again in {retry_after} s.",
                status=429,
                details={"retry_after_seconds": retry_after, "scope": "ip",
                         "limit": COLD_LIMIT_PER_IP, "window_seconds": int(COLD_WINDOW_S)},
            )
        _cold_limiter.hit(ip)
        task = asyncio.ensure_future(_resolve_cold(session_key))
        _flights[session_key] = task
        task.add_done_callback(lambda t, k=session_key: _settle(k, t))
    row = await asyncio.shield(task)
    return dict(row) if row is not None else None


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
async def session_meta(session_key: int, request: Request) -> SessionMeta:
    row = _from_cache(session_key)
    if row is None:
        try:
            row = await _from_openf1(session_key, _client_ip(request))
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
