"""
build_chat_context — compact JSON summary (~800 tokens max) sent to Ollama.
The model never receives raw OpenF1 arrays.
"""
from __future__ import annotations

import json

from app.domain.models import FullRaceAnalysis


def build_chat_context(
    analysis: FullRaceAnalysis,
    focused_driver: str | None = None,
) -> str:
    """
    Return a compact JSON string summarising the race analysis.
    When focused_driver is set, driver-specific data is appended.
    """
    chaos = analysis.chaos
    pace_sorted = sorted(analysis.true_pace, key=lambda r: r.rank)

    ctx: dict = {
        "session": (
            f"{analysis.race.meeting_name} {analysis.race.year} "
            f"— {analysis.race.session_name}"
        ),
        "race_brain": {
            "phase": analysis.race_brain.race_phase,
            "question": analysis.race_brain.main_question,
            "summary": analysis.race_brain.summary,
            "chaos": chaos.score,
            "chaos_level": chaos.level,
            "peak_chaos_lap": chaos.peak_chaos_lap,
        },
        "pace_top3": [
            {
                "driver": r.driver_code,
                "team": r.team_name,
                "pace": r.clean_pace,
                "rank": r.rank,
                "verdict": r.verdict,
            }
            for r in pace_sorted[:3]
        ],
        "tyre_cliffs": [
            {
                "driver": r.driver_code,
                "compound": r.compound,
                "slope": r.degradation_slope,
                "cliff": r.cliff_risk,
                "stints": f"L{r.lap_start}–{r.lap_end}",
            }
            for r in analysis.tyre_degradation
            if r.cliff_risk == "High"
        ][:6],
        "pit_winners": [
            {
                "driver": r.driver_code,
                "lap": r.lap_number,
                "delta": r.net_position_change,
                "verdict": r.verdict,
            }
            for r in analysis.pit_impact
            if (r.net_position_change or 0) > 0 and (r.stop_duration or 0) > 0.5
        ][:4],
        "pit_losers": [
            {
                "driver": r.driver_code,
                "lap": r.lap_number,
                "delta": r.net_position_change,
                "verdict": r.verdict,
            }
            for r in analysis.pit_impact
            if (r.net_position_change or 0) < 0 and (r.stop_duration or 0) > 0.5
        ][:4],
        "key_decisions": [
            {
                "rank": d.rank,
                "lap": d.lap_number,
                "title": d.title,
                "impact": d.impact,
                "explanation": d.explanation,
            }
            for d in analysis.decisions
        ],
        "top_signals": [
            {
                "lap": n.lap_number,
                "type": n.type,
                "severity": n.severity,
                "title": n.title,
                "message": n.message,
            }
            for n in sorted(
                analysis.engineer_notes,
                key=lambda x: {"High": 0, "Medium": 1, "Low": 2}[x.severity],
            )[:6]
        ],
    }

    if focused_driver:
        ctx["focused_driver"] = focused_driver
        driver_pace = next(
            (r for r in analysis.true_pace if r.driver_code == focused_driver), None
        )
        if driver_pace:
            ctx["driver_pace"] = {
                "rank": driver_pace.rank,
                "clean_pace": driver_pace.clean_pace,
                "median_lap": driver_pace.median_lap,
                "sample_size": driver_pace.sample_size,
                "confidence": driver_pace.confidence,
                "verdict": driver_pace.verdict,
                "exclusion_log": driver_pace.exclusion_log,
            }
        ctx["driver_tyres"] = [
            {
                "compound": r.compound,
                "stint": r.stint_number,
                "laps": f"L{r.lap_start}–{r.lap_end}",
                "slope": r.degradation_slope,
                "cliff": r.cliff_risk,
            }
            for r in analysis.tyre_degradation
            if r.driver_code == focused_driver
        ]
        ctx["driver_pits"] = [
            {
                "lap": r.lap_number,
                "lane": r.lane_duration,
                "net_pos": r.net_position_change,
                "verdict": r.verdict,
            }
            for r in analysis.pit_impact
            if r.driver_code == focused_driver
        ]
        ctx["driver_notes"] = [
            {"lap": n.lap_number, "type": n.type, "title": n.title, "message": n.message}
            for n in analysis.engineer_notes
            if focused_driver in n.message or focused_driver in n.title
        ]

    return json.dumps(ctx, default=str)
