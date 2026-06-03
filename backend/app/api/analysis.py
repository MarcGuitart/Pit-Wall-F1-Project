import logging
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

router = APIRouter(tags=["analysis"])
logger = logging.getLogger(__name__)


async def _fetch_session_meta(session_key: int) -> dict:
    """Fetch session info and augment with meeting_name from the meetings endpoint."""
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

    # meetings endpoint has the human-readable Grand Prix name — retry on 429
    import asyncio as _asyncio
    for wait in (0, 2, 5):
        try:
            if wait:
                await _asyncio.sleep(wait)
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

    return session


def _build_race_brain(
    chaos_score: int,
    chaos_level: str,
    chaos_summary: str,
    pace_rows: list,
    tyre_rows: list,
    pit_rows: list,
) -> RaceBrain:
    # Best compound = lowest average degradation slope among all stints
    best_compound: str | None = None
    if tyre_rows:
        compound_slopes: dict[str, list[float]] = {}
        for s in tyre_rows:
            compound_slopes.setdefault(s.compound, []).append(s.degradation_slope)
        compound_avg = {
            c: sum(vals) / len(vals) for c, vals in compound_slopes.items()
        }
        best_compound = min(compound_avg, key=compound_avg.__getitem__)

    # Strategic tension from chaos + tyre diversity
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

    # Summary: use real computed numbers
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


@router.get("/analysis/{session_key}", response_model=FullRaceAnalysis)
async def get_analysis(session_key: int) -> FullRaceAnalysis:
    logger.info("Analysis requested for session_key=%s", session_key)

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
            status_code=404, detail=f"No lap data found for session {session_key}"
        )

    # Session metadata (circuit name, year, etc.)
    try:
        session_meta = await _fetch_session_meta(session_key)
    except Exception as exc:
        logger.warning("Could not fetch session meta: %s", exc)
        session_meta = {}

    race_meta = RaceMeta(
        meeting_key=session_meta.get("meeting_key", 0),
        session_key=session_key,
        meeting_name=session_meta.get("meeting_name", f"Session {session_key}"),
        session_name=session_meta.get("session_name", "Race"),
        circuit_short_name=session_meta.get("circuit_short_name"),
        country_name=session_meta.get("country_name"),
        year=session_meta.get("year", 2024),
    )

    # ── Run all services ──────────────────────────────────────────────────────
    true_pace       = compute_true_pace(laps, stints, pit, race_control, drivers)
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

    result = FullRaceAnalysis(
        race=race_meta,
        race_brain=race_brain,
        true_pace=true_pace[:20],
        tyre_degradation=tyre_degradation,
        pit_impact=pit_impact,
        chaos=chaos,
        engineer_notes=engineer_notes,
        decisions=decisions,
    )

    # Persist computed analysis for /chat endpoint to load without re-running pipeline
    analysis_cache.set_analysis(session_key, result.model_dump())

    return result
