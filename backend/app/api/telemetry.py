"""
GET /telemetry/{session_key} — Circuit telemetry via FastF1 (loaded lazily).

Requires that /analysis/{session_key} has run first so session metadata
(year, circuit, session name) is available from the analysis cache.
"""
import logging

from fastapi import APIRouter, HTTPException, Query

from app.core import cache
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

    # 1. Telemetry cache per requested driver combination
    cached = cache.get(session_key, cache_key)
    if cached:
        return TelemetryData.model_validate(cached)

    # 2. Session metadata must already be in the analysis cache
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

    # 3. Prefer FastF1 circuit telemetry. If FastF1 is unavailable locally,
    # fall back to full-race OpenF1 car_data input traces.
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

    # 4. Cache and return
    cache.set(session_key, cache_key, tel_data.model_dump())
    return tel_data
