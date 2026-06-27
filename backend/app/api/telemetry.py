"""
GET /telemetry/{session_key} — Circuit telemetry via FastF1 (loaded lazily).

Requires that /analysis/{session_key} has run first so session metadata
(year, circuit, session name) is available from the analysis cache.

In production the endpoint is read-only: it serves pre-computed JSON committed
to the repo by the GitHub Actions "Precompute Telemetry Cache" workflow.
FastF1 is never loaded on Render (it would OOM the 512 MB free tier container).
"""
import logging

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from app.core import cache
from app.core.config import settings
from app.domain.models import TelemetryData
from app.services.telemetry_service import load_openf1_race_telemetry, load_telemetry

router = APIRouter(tags=["telemetry"])
logger = logging.getLogger(__name__)


@router.get("/telemetry/{session_key}", response_model=TelemetryData)
async def get_telemetry(
    session_key: int,
    drivers: str = Query(default="NOR,VER,HAM"),
    lap_mode: str = Query(default="fastest_clean", pattern="^(fastest_clean|representative)$"),
) -> TelemetryData:
    driver_list = [d.strip().upper() for d in drivers.split(",") if d.strip()][:5]
    cache_key = f"telemetry_{lap_mode}_" + "_".join(sorted(driver_list))

    logger.info(
        "[TELEMETRY LOOKUP] session=%s cache_key=%s cache_path=%s",
        session_key, cache_key, settings.cache_path.resolve(),
    )

    # 1. Exact match in file cache (pre-computed JSON or previously computed in dev)
    cached = cache.get(session_key, cache_key)
    if cached:
        logger.info("[TELEMETRY EXACT HIT] %s — %s", session_key, cache_key)
        return TelemetryData.model_validate(cached)

    # 2. Flexible match — any pre-computed file for the same lap_mode that covers
    #    all requested drivers. Filters its driver list down to what was requested.
    #    Avoids re-running FastF1 just because the caller asked for a subset.
    session_dir = settings.cache_path / str(session_key)
    logger.info("[TELEMETRY] session_dir=%s exists=%s", session_dir.resolve(), session_dir.exists())
    if session_dir.exists():
        candidates = list(session_dir.glob(f"telemetry_{lap_mode}_*.json"))
        logger.info(
            "[TELEMETRY FLEX] %d candidate(s): %s",
            len(candidates), [c.name for c in candidates],
        )
        driver_set = set(driver_list)
        for candidate in candidates:
            try:
                import json as _json
                data = _json.loads(candidate.read_text())
                cached_codes = {d["driver_code"] for d in data.get("drivers", [])}
                is_match = driver_set.issubset(cached_codes)
                logger.info(
                    "[TELEMETRY FLEX] %s — cached=%s match=%s",
                    candidate.name, sorted(cached_codes), is_match,
                )
                if is_match:
                    data["drivers"] = [
                        d for d in data["drivers"] if d["driver_code"] in driver_set
                    ]
                    logger.info(
                        "[TELEMETRY FLEX HIT] %s — served %s from %s",
                        session_key, sorted(driver_set), candidate.name,
                    )
                    return TelemetryData.model_validate(data)
            except Exception as exc:
                logger.warning("[TELEMETRY FLEX ERROR] %s: %s", candidate.name, exc)
                continue

    # 3. Session type guard — telemetry replay only makes sense for Race sessions.
    #    Read from the nearest metadata source available.
    _meta = cache.get_session_meta(session_key)
    if _meta is None:
        _analysis = cache.get_full_analysis(session_key)
        _session_name = (_analysis or {}).get("race", {}).get("session_name") if _analysis else None
    else:
        _session_name = _meta.get("session_name") or _meta.get("session_type")

    if _session_name and _session_name != "Race":
        return JSONResponse(
            status_code=503,
            content={
                "error": "telemetry_race_only",
                "message": "Circuit telemetry replay is only available for Race sessions.",
            },
        )

    # 4. Production guard — FastF1 downloads 50-200 MB and would OOM Render free tier.
    #    If we reach here in production it means the precompute workflow hasn't run yet.
    if settings.environment == "production":
        return JSONResponse(
            status_code=503,
            content={
                "error": "telemetry_not_precomputed",
                "message": (
                    f"Telemetry for session {session_key} with drivers "
                    f"{','.join(driver_list)} has not been precomputed yet. "
                    "Run the 'Precompute Telemetry Cache' workflow on GitHub Actions."
                ),
            },
        )

    # 5. Development path — session metadata must already be in the analysis cache
    analysis = cache.get_full_analysis(session_key)
    if not analysis:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "ANALYSIS_NOT_FOUND",
                "message": "Run /analysis/{session_key} first to load session metadata.",
            },
        )

    race = analysis["race"]

    # 6. Prefer FastF1 circuit telemetry; fall back to OpenF1 car_data traces
    tel_data = await load_telemetry(
        year=race["year"],
        circuit_name=race.get("circuit_short_name") or race["meeting_name"],
        session_type=race["session_name"],
        driver_codes=driver_list,
        lap_mode=lap_mode,
    )

    if tel_data is None:
        laps = cache.get(session_key, "laps") or []
        drivers_data = cache.get(session_key, "drivers") or []
        tel_data = await load_openf1_race_telemetry(
            session_key=session_key,
            race=race,
            laps_data=laps,
            drivers_data=drivers_data,
            driver_codes=driver_list,
        )

    if tel_data is None:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "TELEMETRY_UNAVAILABLE",
                "message": "FastF1 telemetry not available for this session.",
            },
        )

    # 7. Persist for next request
    cache.set(session_key, cache_key, tel_data.model_dump())
    return tel_data
