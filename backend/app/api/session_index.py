"""
GET /published                      which sessions have a published analysis (block 33)
GET /sessions/{session_key}/calendar.ics   one session as an RFC 5545 calendar file

/published answers the /races panel's cell states without asking for any
analysis: a session is published when its _analysis.json was on disk when the
server started (app.api.published_set: on Render, the analyses versioned in
the repo); one computed on demand afterwards is not listed. Public,
not PRO: it lists session keys and calendar facts, never analysis content.
It never touches OpenF1. The index lives in memory and is rebuilt only when
the cache directory, or one of its session directories, changes mtime (a
rewritten meta or a removed analysis), so a request costs a stat per
directory, not a read per file.

calendar.ics reuses /sessions/{key}/meta for the facts (disk first, OpenF1
only on a cold key, under that route's memo and per IP limit). Times are UTC
("Z"), the UID is stable (pitwall-<key>@pitwallengineer.com, the one the
browser-built file already uses, so a calendar updates in place rather than
duplicating), and the file is served inline so a phone opens it in its
calendar.
"""
from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import Response
from pydantic import BaseModel

from app.api import published_set
from app.api.session_meta import session_meta
from app.core.config import settings
from app.core.errors import AppError

logger = logging.getLogger(__name__)
router = APIRouter(tags=["sessions"])

ANALYSIS_FILE = published_set.ANALYSIS_FILE
META_FILE = "_session_meta.json"
PRODUCT = "Pit Wall Engineer"
UID_DOMAIN = "pitwallengineer.com"
# Only when OpenF1 gives no end: a race runs about two hours, anything else one.
DEFAULT_DURATION = {"Race": timedelta(hours=2)}
FALLBACK_DURATION = timedelta(hours=1)


class PublishedSession(BaseModel):
    session_key: int
    meeting_key: int | None = None
    year: int | None = None
    session_name: str | None = None
    session_type: str | None = None


class PublishedIndex(BaseModel):
    count: int
    sessions: list[PublishedSession]


# ── /published ───────────────────────────────────────────────────────────────

class _Index:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._signature: tuple | None = None
        self._root: Path | None = None
        self._value: PublishedIndex = PublishedIndex(count=0, sessions=[])

    @staticmethod
    def _signature_of(root: Path) -> tuple:
        if not root.is_dir():
            return ()
        dirs = sorted(p for p in root.iterdir() if p.is_dir() and p.name.isdigit())
        return (root.stat().st_mtime_ns, tuple((d.name, d.stat().st_mtime_ns) for d in dirs))

    @staticmethod
    def _build(root: Path) -> PublishedIndex:
        rows: list[PublishedSession] = []
        if root.is_dir():
            for f in published_set.files(root):
                d = f.parent
                meta: dict = {}
                try:
                    meta = json.loads((d / META_FILE).read_text())
                except (OSError, ValueError):
                    meta = {}
                if not isinstance(meta, dict):
                    meta = {}
                rows.append(PublishedSession(
                    session_key=int(d.name),
                    meeting_key=meta.get("meeting_key") if isinstance(meta.get("meeting_key"), int) else None,
                    year=meta.get("year") if isinstance(meta.get("year"), int) else None,
                    session_name=meta.get("session_name") if isinstance(meta.get("session_name"), str) else None,
                    session_type=meta.get("session_type") if isinstance(meta.get("session_type"), str) else None,
                ))
        rows.sort(key=lambda r: r.session_key)
        return PublishedIndex(count=len(rows), sessions=rows)

    def get(self) -> PublishedIndex:
        root = settings.cache_path
        signature = self._signature_of(root)
        with self._lock:
            if signature != self._signature or root != self._root:
                self._value = self._build(root)
                self._signature, self._root = signature, root
                logger.info("[PUBLISHED] index rebuilt: %d session(s)", self._value.count)
            return self._value


_index = _Index()


def _reset_for_tests() -> None:
    global _index
    _index = _Index()
    published_set._reset_for_tests()


@router.get("/published", response_model=PublishedIndex)
async def published() -> PublishedIndex:
    return _index.get()


# ── calendar.ics ─────────────────────────────────────────────────────────────

def _escape(value: str) -> str:
    """RFC 5545 §3.3.11 TEXT: backslash first, then ; , and newlines."""
    return (value.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
            .replace("\r\n", "\\n").replace("\n", "\\n").replace("\r", "\\n"))


def _fold(line: str) -> str:
    """RFC 5545 §3.1: lines longer than 75 octets continue after CRLF and a space."""
    out, current = [], b""
    for ch in line:
        b = ch.encode()
        if len(current) + len(b) > (75 if not out else 74):
            out.append(current.decode())
            current = b""
        current += b
    out.append(current.decode())
    return "\r\n ".join(out)


def _utc(iso: str) -> datetime:
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _stamp(dt: datetime) -> str:
    return dt.strftime("%Y%m%dT%H%M%SZ")


def build_ics(meta: dict) -> str:
    start = _utc(meta["date_start"])
    end = _utc(meta["date_end"]) if meta.get("date_end") else \
        start + DEFAULT_DURATION.get(meta.get("session_type") or "", FALLBACK_DURATION)
    gp = meta.get("meeting_name") or meta.get("location") or "Formula 1"
    session = meta.get("session_name") or meta.get("session_type") or "Session"
    place = ", ".join(p for p in (meta.get("circuit_short_name"), meta.get("country_name")) if p)
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:-//{PRODUCT}//Race Calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:pitwall-{meta['session_key']}@{UID_DOMAIN}",
        # DTSTAMP from the session, not from now: the same session gives the same file.
        f"DTSTAMP:{_stamp(start)}",
        f"DTSTART:{_stamp(start)}",
        f"DTEND:{_stamp(end)}",
        f"SUMMARY:{_escape(f'{gp}: {session}')}",
    ]
    if place:
        lines.append(f"LOCATION:{_escape(place)}")
    lines += [
        f"DESCRIPTION:{_escape(f'{PRODUCT}. Times in UTC; your calendar shows them in your own time zone.')}",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(_fold(l) for l in lines) + "\r\n"


@router.get("/sessions/{session_key}/calendar.ics")
async def calendar_ics(session_key: int, request: Request) -> Response:
    meta = (await session_meta(session_key, request)).model_dump()
    if meta.get("is_cancelled"):
        raise AppError("SESSION_CANCELLED", "This session was cancelled.", status=410,
                       details={"session_key": session_key})
    if not meta.get("date_start"):
        raise AppError("SESSION_NOT_SCHEDULED", "This session has no start time yet.", status=404,
                       details={"session_key": session_key})
    return Response(
        content=build_ics(meta),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'inline; filename="pitwall-{session_key}.ics"',
                 "Cache-Control": "public, max-age=3600"},
    )
