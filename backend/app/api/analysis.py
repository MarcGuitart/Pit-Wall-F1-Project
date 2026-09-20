import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import ValidationError

from app.core.config import settings
from app.core.errors import AppError
from app.core import cache as analysis_cache
from app.domain.models import FullRaceAnalysis, ModuleStatus, RaceMeta, RaceBrain
from app.clients.openf1_client import OpenF1AuthError, OpenF1Error, OpenF1RateLimitError, fetch_json
from app.services.race_loader import load_session
from app.services.pace_service import compute_true_pace
from app.services.tyre_service import compute_tyre_degradation
from app.services.pit_service import compute_pit_impact
from app.services.chaos_service import METHOD_VERSION as CHAOS_METHOD_VERSION, compute_chaos_index
from app.services.notes_service import generate_engineer_notes
from app.services.decisions_service import compute_decisions
from app.services.weather_service import compute_weather_analysis
from app.services.drs_service import compute_drs_trains, aggregate_drs_trains, compute_raw_snapshots
from app.services.timeline_builder import build_race_timeline
from app.services.race_dna_service import compute_race_dna
from app.services.race_phase_service import classify_race_phases
from app.services.crossover_service import detect_crossover_windows, compute_weather_winners_losers
from app.services.clean_air_service import estimate_clean_air_value
from app.services.classification_service import compute_race_classification
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

    sessions = await fetch_json("sessions", session_key=session_key)
    if not sessions:
        return {}

    session = sessions[0]

    # meetings endpoint has the human-readable Grand Prix name — best effort
    try:
        meetings = await fetch_json("meetings", meeting_key=session["meeting_key"])
    except OpenF1Error as exc:
        logger.warning("Could not fetch meeting name for %s: %s", session_key, exc)
        meetings = []
    if meetings:
        session["meeting_name"] = meetings[0].get(
            "meeting_name", session.get("meeting_name", "")
        )

    analysis_cache.set_session_meta(session_key, session)
    return session


# ── Cached analysis loader ─────────────────────────────────────────────────

def _read_cached_analysis(session_key: int) -> FullRaceAnalysis | None:
    """
    Three outcomes for _analysis.json:
    - fresh (current chaos method, validates)      → return it
    - stale (older method or schema, valid JSON)   → None: recompute from the cached raw data
    - corrupt (file exists but is not valid JSON)  → ANALYSIS_FAILED; the unreadable
      file is removed by the cache layer so the next request recomputes
    Missing files also return None.
    """
    existed = analysis_cache.has_full_analysis(session_key)
    cached = analysis_cache.get_full_analysis(session_key)
    if cached is None:
        if existed:
            raise AppError(
                "ANALYSIS_FAILED",
                "The cached analysis for this session was unreadable and has been "
                "discarded. Retry to recompute it.",
                status=500,
                details={"session_key": session_key, "reason": "corrupt_cache"},
            )
        return None

    version = (cached.get("chaos") or {}).get("method_version")
    if version != CHAOS_METHOD_VERSION:
        logger.info(
            "[CACHE STALE] %s: chaos method %s != %s — recomputing",
            session_key, version, CHAOS_METHOD_VERSION,
        )
        return None
    try:
        return FullRaceAnalysis.model_validate(cached)
    except ValidationError as exc:
        logger.warning("[CACHE STALE] %s: schema mismatch (%s) — recomputing", session_key, exc.error_count())
        return None


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

    # Phase follows chaos.level — the thresholds live in chaos_service only.
    phase, tension, question = {
        "Extreme": ("Weather-affected race", "High",
                    "Which teams managed the chaos and tyre transitions best?"),
        "High":    ("High-incident race", "High",
                    "Did SC/VSC timing create or destroy the race outcome?"),
        "Medium":  ("Strategic race", "Medium",
                    "Did the tyre strategy calls match the degradation windows?"),
        "Low":     ("Clean race", "Low",
                    "Who had the true pace advantage and was it enough?"),
    }[chaos_level]

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
        cached_analysis = _read_cached_analysis(session_key)
        if cached_analysis is not None:
            logger.info("[CACHE HIT] Full analysis for %s — returning immediately", session_key)
            return cached_analysis

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
                raise AppError(
                    "SESSION_NOT_HISTORICAL_YET",
                    "This session may still be inside OpenF1's live window. "
                    "Historical data should become available approximately "
                    "30 minutes after the session ends.",
                    status=425,
                    details={
                        "unlock_at_utc": unlock_at.isoformat(),
                        "retry_after_minutes": minutes_remaining,
                    },
                )

    # 4. Acquire per-session lock — prevents concurrent duplicate computation
    lock = await _get_analysis_lock(session_key)
    async with lock:
        # Double-check cache inside lock (another request may have computed while we waited)
        if not force_refresh:
            cached_analysis = _read_cached_analysis(session_key)
            if cached_analysis is not None:
                logger.info("[CACHE HIT inside lock] %s", session_key)
                return cached_analysis

        logger.info("[COMPUTING] Analysis for %s — fetching endpoints", session_key)

        # 5. Fetch all data (respects per-endpoint cache + semaphore + jitter)
        try:
            data = await load_session(session_key)
        except OpenF1AuthError as exc:
            if not settings.openf1_api_token:
                # Demo mode: nothing cached for this session and no token to fetch it.
                raise AppError(
                    "SESSION_NOT_CACHED",
                    "This session is not available in the production demo. "
                    "Try Brasil 2024 (9636) or España 2024 (9539).",
                    status=404,
                    details={"endpoint": exc.endpoint},
                ) from exc
            raise AppError(
                "OPENF1_UNAUTHORIZED",
                f"OpenF1 rejected the configured API token while fetching {exc.endpoint}.",
                status=503,
                details={"endpoint": exc.endpoint},
            ) from exc
        except OpenF1RateLimitError as exc:
            raise AppError(
                "OPENF1_RATE_LIMIT",
                f"OpenF1 is rate-limiting requests (while fetching {exc.endpoint}). "
                "Endpoints already fetched are cached; retry in a minute to resume.",
                status=429,
                details=exc.details(),
            ) from exc
        except OpenF1Error as exc:
            raise AppError(
                "OPENF1_ERROR",
                f"OpenF1 did not return {exc.endpoint} for session {session_key} "
                f"after {exc.attempts} attempts.",
                status=503,
                details=exc.details(),
            ) from exc

        laps = data.get("laps", [])
        stints = data.get("stints", [])
        pit = data.get("pit", [])
        position_data = data.get("position", [])
        race_control = data.get("race_control", [])
        weather = data.get("weather", [])
        drivers = data.get("drivers", [])

        if not laps:
            if not session_meta:
                # Distinguish: no token means we're in static-cache-only mode and this
                # session simply isn't available in the demo. With a token, the session
                # is probably too recent for OpenF1 to have published it yet.
                if not settings.openf1_api_token:
                    raise AppError(
                        "SESSION_NOT_CACHED",
                        "This session is not available in the production demo. "
                        "Try Brasil 2024 (9636) or España 2024 (9539).",
                        status=404,
                    )
                raise AppError(
                    "SESSION_NOT_HISTORICAL_YET",
                    "No session metadata or lap data found. "
                    "This session may not yet be available in OpenF1. "
                    "Historical data typically becomes available 30 minutes after the session ends.",
                    status=425,
                    details={"unlock_at_utc": None, "retry_after_minutes": 30},
                )
            raise AppError(
                "OPENF1_ERROR",
                f"OpenF1 returned no lap data for session {session_key}.",
                status=503,
                details={"endpoint": "laps"},
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

        try:
            # 6. Shared RaceTimeline (built ONCE — chaos and all V4 services read from it)
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

            # 7. Run V1/V2/V3 services
            true_pace        = compute_true_pace(laps, stints, pit, race_control, drivers)
            tyre_degradation = compute_tyre_degradation(laps, stints, race_control, drivers)
            pit_impact       = compute_pit_impact(pit, position_data, laps, drivers)
            chaos            = compute_chaos_index(timeline, race_control, laps, position_data, pit)

            # Actual race result — independent of True Pace, attached onto each row
            # so the two are shown side by side rather than mistaken for each other.
            race_classification = compute_race_classification(position_data, drivers)
            result_by_driver = {r.driver_number: r for r in race_classification}
            for row in true_pace:
                res = result_by_driver.get(row.driver_number)
                if res:
                    row.grid_position = res.grid_position
                    row.finishing_position = res.finishing_position
                    row.positions_gained = res.positions_gained
            race_brain       = _build_race_brain(
                chaos.score, chaos.level, chaos.summary,
                true_pace, tyre_degradation, pit_impact,
            )
            engineer_notes   = generate_engineer_notes(
                tyre_degradation, pit_impact, chaos, race_control, weather, laps
            )
            decisions        = compute_decisions(pit_impact, tyre_degradation, chaos, len(true_pace))
            weather_analysis = compute_weather_analysis(weather, laps)

            # 8-9. V4 modules — each wrapped so a partial failure never breaks the
            # response. `modules` records ok / failed / not_applicable per field.
            modules: dict[str, ModuleStatus] = {}

            def _module(name: str, compute, is_empty, empty_reason: str):
                try:
                    value = compute()
                except Exception as exc:  # noqa: BLE001 — isolate the module, keep the page
                    logger.warning("[V4] %s failed: %s", name, exc, exc_info=True)
                    modules[name] = ModuleStatus(
                        status="failed", reason=f"{type(exc).__name__}: {exc}"[:200]
                    )
                    return None
                if is_empty(value):
                    modules[name] = ModuleStatus(status="not_applicable", reason=empty_reason)
                else:
                    modules[name] = ModuleStatus(status="ok")
                return value

            modules["weather_analysis"] = (
                ModuleStatus(status="ok") if weather_analysis is not None
                else ModuleStatus(status="not_applicable", reason="No weather records for this session.")
            )

            drs_trains = _module(
                "drs_trains",
                lambda: compute_drs_trains(intervals, laps, drivers, timeline),
                lambda v: v is None or not v.meaningful_trains,
                "No sustained DRS trains (3+ cars within 1.0s) in this race.",
            )
            meaningful_trains = drs_trains.meaningful_trains if drs_trains else []

            crossover_windows = _module(
                "crossover_windows",
                lambda: detect_crossover_windows(timeline, stints, pit_impact),
                lambda v: not v,
                "No wet/dry transitions in this race.",
            ) or []

            weather_winners_losers = _module(
                "weather_winners_losers",
                lambda: compute_weather_winners_losers(
                    crossover_windows, pit_impact, position_data, race_control, timeline
                ),
                lambda v: v is None,
                (
                    "No crossover windows to attribute gains or losses to."
                    if not crossover_windows
                    else "No position changes attributable to crossover timing."
                ),
            )

            race_phases = _module(
                "race_phases",
                lambda: classify_race_phases(
                    timeline, tyre_degradation, pit_impact,
                    crossover_windows, meaningful_trains, total_laps,
                ),
                lambda v: not v,
                "No distinct race phases identified.",
            ) or []

            race_dna = _module(
                "race_dna",
                lambda: compute_race_dna(
                    chaos, weather_analysis, meaningful_trains,
                    true_pace, tyre_degradation, pit_impact, race_phases,
                ),
                lambda v: v is None,
                "Not enough signals to characterise this race.",
            )

            clean_air_value = _module(
                "clean_air_value",
                lambda: estimate_clean_air_value(
                    meaningful_trains, true_pace, laps, timeline
                ),
                lambda v: v is None or v.estimated_gain is None,
                "No clean-air comparison available: needs DRS trains with clean laps before and after.",
            )

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
                race_classification=race_classification,
                modules=modules,
            )

            # 7. Persist to disk
            analysis_cache.set_full_analysis(session_key, result.model_dump())
            logger.info("[COMPUTING] Analysis for %s — complete", session_key)

            return result
        except AppError:
            raise
        except Exception as exc:  # noqa: BLE001 — a V1-V3 service or the model crashed
            logger.exception("[COMPUTING] Analysis for %s failed", session_key)
            raise AppError(
                "ANALYSIS_FAILED",
                f"The analysis for session {session_key} could not be computed "
                f"({type(exc).__name__}). The raw data is cached; retry or report it.",
                status=500,
                details={"session_key": session_key, "exception": type(exc).__name__},
            ) from exc
