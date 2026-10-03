"""
GET /laps/{session_key} — the lap-by-lap chart input for a published race.

Normally served from _lap_charts.json, which the analysis pipeline writes next
to _analysis.json and the publication workflow commits with it. A race
published before that file existed is built here on first request from five
OpenF1 endpoints (not the nine the analysis needs — no intervals, no
positions), then kept for the life of the container.
"""
import asyncio
import logging

from fastapi import APIRouter, Request

from app.api.analysis import _session_year
from app.clients.openf1_client import OpenF1Error, fetch_json
from app.core import cache
from app.core.access import require_season_access
from app.core.errors import AppError
from app.services.lap_charts_service import LAP_CHARTS_VERSION, build_lap_charts

router = APIRouter(tags=["laps"])
logger = logging.getLogger(__name__)

_ENDPOINTS = ("laps", "stints", "pit", "race_control", "drivers")
_locks: dict[int, asyncio.Lock] = {}


@router.get("/laps/{session_key}")
async def get_lap_charts(session_key: int, request: Request) -> dict:
    # Same gate as /analysis, and before any file is read.
    require_season_access(request, await _session_year(session_key), session_key)

    cached = cache.get_lap_charts(session_key)
    if cached and cached.get("version") == LAP_CHARTS_VERSION:
        return cached

    analysis = cache.get_full_analysis(session_key)
    if analysis is None:
        # Only a race that has been analysed is known to be finished; building
        # from a session still running would chart half a race as if whole.
        raise AppError("LAP_CHARTS_UNAVAILABLE",
                       "Lap charts are built for published races only.", status=404)

    lock = _locks.setdefault(session_key, asyncio.Lock())
    async with lock:
        cached = cache.get_lap_charts(session_key)
        if cached and cached.get("version") == LAP_CHARTS_VERSION:
            return cached
        data: dict[str, list] = {}
        try:
            for ep in _ENDPOINTS:
                rows = cache.get(session_key, ep)
                if rows is None:
                    rows = await fetch_json(ep, session_key=session_key)
                    cache.set(session_key, ep, rows)
                data[ep] = rows
        except OpenF1Error as exc:
            raise AppError("OPENF1_ERROR", f"OpenF1 did not return {exc.endpoint} for session {session_key}.",
                           status=503, details=exc.details()) from exc
        result = build_lap_charts(
            session_key, data["laps"], data["stints"], data["pit"], data["race_control"], data["drivers"],
            classification=analysis.get("race_classification"),
        )
        cache.set_lap_charts(session_key, result)
        return result
