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

    # ── V4 optional context (added only when available) ─────────────────────

    if analysis.race_dna:
        ctx["race_dna"] = {
            "primary_factor": analysis.race_dna.primary_factor,
            "secondary_factor": analysis.race_dna.secondary_factor,
            "strategy_type": analysis.race_dna.strategy_type,
        }

    if analysis.race_phases:
        priority_order = {"High": 0, "Medium": 1, "Low": 2}
        top_phases = sorted(analysis.race_phases, key=lambda p: priority_order.get(p.impact, 3))[:3]
        ctx["phase_summary"] = [
            {
                "laps": f"L{p.lap_start}–{p.lap_end}",
                "phase": p.phase,
                "impact": p.impact,
            }
            for p in top_phases
        ]

    if analysis.crossover_windows:
        cw = analysis.crossover_windows[0]
        ctx["crossover_summary"] = {
            "laps": f"L{cw.lap_start}–{cw.lap_end}",
            "transition": f"{cw.from_condition} → {cw.to_condition}",
            "impact": cw.impact,
            "concurrent_sc": cw.concurrent_sc,
            "best_timed": cw.best_timed_drivers[:3],
            "late": cw.late_drivers[:3],
        }

    # Weather attribution note — critical for credibility when SC and rain co-occurred
    if analysis.weather_winners_losers and analysis.weather_winners_losers.attribution_note:
        ctx["weather_attribution_note"] = analysis.weather_winners_losers.attribution_note
    elif analysis.crossover_windows and all(w.concurrent_sc for w in analysis.crossover_windows):
        ctx["weather_attribution_note"] = (
            "All weather transitions in this session coincided with safety car periods. "
            "Position changes cannot be attributed to tyre choice alone — "
            "SC timing was the primary driver of the order changes."
        )

    if analysis.drs_trains and analysis.drs_trains.peak_train:
        pt = analysis.drs_trains.peak_train
        ctx["drs_summary"] = {
            "peak_train_laps": f"L{pt.lap_start}–{pt.lap_end}",
            "peak_length": pt.peak_length,
            "duration_s": pt.duration_seconds,
            "leader": pt.leader,
            "trapped": pt.trapped_drivers[:3],
            "impact": pt.impact,
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
