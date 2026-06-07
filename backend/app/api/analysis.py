import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
import httpx

from app.core.config import settings
from app.core import cache as analysis_cache
from app.domain.models import FullRaceAnalysis, RaceMeta, RaceBrain
from app.services.race_loader import load_session
from app.services.pace_service import compute_true_pace
from app.services.tyre_service import compute_tyre_degradation
from app.services.pit_service import compute_pit_impact
from app.services.chaos_service import compute_chaos_index
from app.services.notes_service import generate_engineer_notes
from app.services.decisions_service import compute_decisions
from app.services.weather_service import compute_weather_analysis
from app.services.drs_service import compute_drs_trains, aggregate_drs_trains, compute_raw_snapshots
from app.services.timeline_builder import build_race_timeline
from app.services.race_dna_service import compute_race_dna
from app.services.race_phase_service import classify_race_phases
from app.services.crossover_service import detect_crossover_windows, compute_weather_winners_losers
from app.services.clean_air_service import estimate_clean_air_value
from app.utils.time import is_session_historical

router = APIRouter(tags=["analysis"])
logger = logging.getLogger(__name__)

# ── Single-flight lock per session_key ────────────────────────────────────

_analysis_locks: dict[int, asyncio.Lock] = {}
_locks_mutex = asyncio.Lock()


async def _get_analysis_lock(session_key: int) -> asyncio.Lock:
    async with _locks_mutex:
        if session_key not in _analysis_locks:
            _analysis_locks[session_key] = asyncio.Lock()
        return _analysis_locks[session_key]


# ── Session metadata helper ────────────────────────────────────────────────

async def _fetch_session_meta(session_key: int) -> dict:
    """Fetch session info, using file cache to avoid repeat OpenF1 calls."""
    cached_meta = analysis_cache.get_session_meta(session_key)
    if cached_meta:
        return cached_meta

    async with httpx.AsyncClient(timeout=15.0) as client:
        s_resp = await client.get(
            f"{settings.openf1_base_url}/sessions",
            params={"session_key": session_key},
        )
        s_resp.raise_for_status()
        sessions = s_resp.json()

    if not sessions:
        return {}

    session = sessions[0]

    # meetings endpoint has the human-readable Grand Prix name
    for wait in (0, 2, 5):
        try:
            if wait:
                await asyncio.sleep(wait)
            async with httpx.AsyncClient(timeout=15.0) as client:
                m_resp = await client.get(
                    f"{settings.openf1_base_url}/meetings",
                    params={"meeting_key": session["meeting_key"]},
                )
                m_resp.raise_for_status()
                meetings = m_resp.json()
            if meetings:
                session["meeting_name"] = meetings[0].get(
                    "meeting_name", session.get("meeting_name", "")
                )
            break
        except Exception:
            continue

    analysis_cache.set_session_meta(session_key, session)
    return session


# ── RaceBrain builder ──────────────────────────────────────────────────────

def _build_race_brain(
    chaos_score: int,
    chaos_level: str,
    chaos_summary: str,
    pace_rows: list,
    tyre_rows: list,
    pit_rows: list,
) -> RaceBrain:
    best_compound: str | None = None
    if tyre_rows:
        compound_slopes: dict[str, list[float]] = {}
        for s in tyre_rows:
            compound_slopes.setdefault(s.compound, []).append(s.degradation_slope)
        compound_avg = {
            c: sum(vals) / len(vals) for c, vals in compound_slopes.items()
        }
        best_compound = min(compound_avg, key=compound_avg.__getitem__)

    if chaos_score >= 80:
        phase = "Weather-affected race"
        tension = "High"
        question = "Which teams managed the chaos and tyre transitions best?"
    elif chaos_score >= 50:
        phase = "High-incident race"
        tension = "High"
        question = "Did SC/VSC timing create or destroy the race outcome?"
    elif chaos_score >= 25:
        phase = "Strategic race"
        tension = "Medium"
        question = "Did the tyre strategy calls match the degradation windows?"
    else:
        phase = "Clean race"
        tension = "Low"
        question = "Who had the true pace advantage and was it enough?"

    top3 = [r.driver_code for r in pace_rows[:3]]
    top3_str = " › ".join(top3) if top3 else "–"

    cliff_drivers = [s.driver_code for s in tyre_rows if s.cliff_risk == "High"]
    cliff_str = (
        f"Tyre cliff risk: {', '.join(set(cliff_drivers[:3]))}. " if cliff_drivers else ""
    )

    slow_stops = [p for p in pit_rows if p.lane_duration and p.lane_duration > 25.0]
    stop_str = (
        f"{len(slow_stops)} slow pit stop{'s' if len(slow_stops) != 1 else ''}. "
        if slow_stops
        else ""
    )

    summary = (
        f"{chaos_summary} "
        f"Pace hierarchy: {top3_str}. "
        f"{cliff_str}{stop_str}"
        f"{len(pace_rows)} drivers analysed, {len(tyre_rows)} stints mapped."
    ).strip()

    return RaceBrain(
        race_phase=phase,
        main_question=question,
        chaos_index=chaos_score,
        best_compound=best_compound,
        strategic_tension=tension,  # type: ignore[arg-type]
        summary=summary,
    )


# ── Main analysis endpoint ─────────────────────────────────────────────────

@router.get("/analysis/{session_key}", response_model=FullRaceAnalysis)
async def get_analysis(
    session_key: int,
    force_refresh: bool = False,
) -> FullRaceAnalysis:
    logger.info("[ANALYSIS REQUEST] session_key=%s force_refresh=%s", session_key, force_refresh)

    # 1. Fast path: full analysis cache (no lock needed for read)
    if not force_refresh:
        cached = analysis_cache.get_full_analysis(session_key)
        if cached:
            logger.info("[CACHE HIT] Full analysis for %s — returning immediately", session_key)
            return FullRaceAnalysis.model_validate(cached)

    # 2. Session metadata — needed for historical check
    try:
        session_meta = await _fetch_session_meta(session_key)
    except Exception as exc:
        logger.warning("Could not fetch session meta: %s", exc)
        session_meta = {}

    # 3. Historical unlock guard
    if session_meta and not force_refresh:
        date_start = session_meta.get("date_start")
        session_type = session_meta.get("session_type", "Race")
        if date_start:
            historical, unlock_at = is_session_historical(date_start, session_type)
            if not historical:
                minutes_remaining = max(
                    0,
                    int((unlock_at - datetime.now(timezone.utc)).total_seconds() / 60),
                )
                raise HTTPException(
                    status_code=425,
                    detail={
                        "code": "SESSION_NOT_HISTORICAL_YET",
                        "message": (
                            "This session may still be inside OpenF1's live window. "
                            "Historical data should become available approximately "
                            "30 minutes after the session ends."
                        ),
                        "unlock_at_utc": unlock_at.isoformat(),
                        "retry_after_minutes": minutes_remaining,
                    },
                )

    # 4. Acquire per-session lock — prevents concurrent duplicate computation
    lock = await _get_analysis_lock(session_key)
    async with lock:
        # Double-check cache inside lock (another request may have computed while we waited)
        if not force_refresh:
            cached = analysis_cache.get_full_analysis(session_key)
            if cached:
                logger.info("[CACHE HIT inside lock] %s", session_key)
                return FullRaceAnalysis.model_validate(cached)

        logger.info("[COMPUTING] Analysis for %s — fetching endpoints", session_key)

        # 5. Fetch all data (respects per-endpoint cache + semaphore + jitter)
        try:
            data = await load_session(session_key)
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

        laps = data.get("laps", [])
        stints = data.get("stints", [])
        pit = data.get("pit", [])
        position_data = data.get("position", [])
        race_control = data.get("race_control", [])
        weather = data.get("weather", [])
        drivers = data.get("drivers", [])

        if not laps:
            raise HTTPException(
                status_code=404,
                detail=f"No lap data found for session {session_key}",
            )

        race_meta = RaceMeta(
            meeting_key=session_meta.get("meeting_key", 0),
            session_key=session_key,
            meeting_name=session_meta.get("meeting_name", f"Session {session_key}"),
            session_name=session_meta.get("session_name", "Race"),
            circuit_short_name=session_meta.get("circuit_short_name"),
            country_name=session_meta.get("country_name"),
            year=session_meta.get("year", 2024),
        )

        # 6. Run V1/V2/V3 services
        true_pace        = compute_true_pace(laps, stints, pit, race_control, drivers)
        tyre_degradation = compute_tyre_degradation(laps, stints, race_control, drivers)
        pit_impact       = compute_pit_impact(pit, position_data, laps, drivers)
        chaos            = compute_chaos_index(race_control, weather, position_data)
        race_brain       = _build_race_brain(
            chaos.score, chaos.level, chaos.summary,
            true_pace, tyre_degradation, pit_impact,
        )
        engineer_notes   = generate_engineer_notes(
            tyre_degradation, pit_impact, chaos, race_control, weather, laps
        )
        decisions        = compute_decisions(pit_impact, tyre_degradation, chaos, len(true_pace))
        weather_analysis = compute_weather_analysis(weather, laps)

        # 7. Build shared RaceTimeline (called ONCE — all V4 services read from it)
        intervals = data.get("intervals", [])
        timeline = build_race_timeline(
            laps_data=laps,
            weather_data=weather,
            race_control_data=race_control,
            pit_data=pit,
            interval_data=intervals,
            position_data=position_data,
            session_key=session_key,
        )
        total_laps = timeline.total_laps or 70

        # 8. DRS aggregation — passes timeline for SC filtering
        drs_trains = compute_drs_trains(intervals, laps, drivers, timeline)
        meaningful_trains = drs_trains.meaningful_trains if drs_trains else []

        # 9. V4 services — each wrapped so partial failures don't break the response
        crossover_windows = []
        weather_winners_losers = None
        race_phases = []
        race_dna = None
        clean_air_value = None

        try:
            crossover_windows = detect_crossover_windows(timeline, stints, pit_impact)
        except Exception as exc:
            logger.warning("[V4] detect_crossover_windows failed: %s", exc)

        try:
            weather_winners_losers = compute_weather_winners_losers(
                crossover_windows, pit_impact, position_data, race_control, timeline
            )
        except Exception as exc:
            logger.warning("[V4] compute_weather_winners_losers failed: %s", exc)

        try:
            race_phases = classify_race_phases(
                timeline, tyre_degradation, pit_impact,
                crossover_windows, meaningful_trains, total_laps,
            )
        except Exception as exc:
            logger.warning("[V4] classify_race_phases failed: %s", exc)

        try:
            race_dna = compute_race_dna(
                chaos, weather_analysis, meaningful_trains,
                true_pace, tyre_degradation, pit_impact, race_phases,
            )
        except Exception as exc:
            logger.warning("[V4] compute_race_dna failed: %s", exc)

        try:
            clean_air_value = estimate_clean_air_value(
                meaningful_trains, true_pace, laps, timeline
            )
        except Exception as exc:
            logger.warning("[V4] estimate_clean_air_value failed: %s", exc)

        result = FullRaceAnalysis(
            race=race_meta,
            race_brain=race_brain,
            race_dna=race_dna,
            race_phases=race_phases,
            true_pace=true_pace[:20],
            tyre_degradation=tyre_degradation,
            pit_impact=pit_impact,
            chaos=chaos,
            engineer_notes=engineer_notes,
            decisions=decisions,
            weather_analysis=weather_analysis,
            crossover_windows=crossover_windows,
            weather_winners_losers=weather_winners_losers,
            drs_trains=drs_trains,
            clean_air_value=clean_air_value,
        )

        # 7. Persist to disk
        analysis_cache.set_full_analysis(session_key, result.model_dump())
        logger.info("[COMPUTING] Analysis for %s — complete", session_key)

        return result
