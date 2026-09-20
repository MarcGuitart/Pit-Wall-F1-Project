"""
build_chat_context — compact JSON summary (~800 tokens max) sent to Ollama.
The model never receives raw OpenF1 arrays.
"""
from __future__ import annotations

import json
import re

from app.domain.models import EngineerNote, FullRaceAnalysis

MAX_SIGNALS = 8             # engineer notes sent per message (of up to 20 in the analysis)
LAP_WINDOW = 3              # ± laps around a lap mentioned in the question
MAX_PER_GROUP = 2           # notes of the same type on the same lap sent before the rest get a turn
_SEVERITY = {"High": 3, "Medium": 2, "Low": 1}
_LAP_RE = re.compile(r"\b(?:lap|laps|l)\s*(\d{1,3})\b", re.IGNORECASE)
_CODE_RE = re.compile(r"\b([A-Z]{3})\b")


def signal_catalog(analysis: FullRaceAnalysis) -> dict[str, EngineerNote]:
    """
    Stable ids for the engineer notes of a cached analysis: S1..Sn in the
    order they are stored. Ids never depend on the question.
    """
    return {f"S{i}": n for i, n in enumerate(analysis.engineer_notes, start=1)}


def _question_focus(analysis: FullRaceAnalysis, question: str | None, focused_driver: str | None) -> tuple[set[int], set[str]]:
    laps: set[int] = set()
    codes: set[str] = set()
    known = {r.driver_code for r in analysis.true_pace} | {r.driver_code for r in analysis.race_classification}
    if question:
        for m in _LAP_RE.finditer(question):
            laps.add(int(m.group(1)))
        for m in _CODE_RE.finditer(question):
            if m.group(1) in known:
                codes.add(m.group(1))
    if focused_driver:
        codes.add(focused_driver)
    return laps, codes


def select_signals(
    analysis: FullRaceAnalysis,
    question: str | None = None,
    focused_driver: str | None = None,
    limit: int = MAX_SIGNALS,
) -> dict[str, EngineerNote]:
    """
    The subset of the catalogue sent with a message: ranked by severity, with
    a boost for notes inside ±LAP_WINDOW of a lap the question mentions and
    for notes naming a driver the question (or the focus) mentions. Ids are
    the catalogue ids, so they stay stable across questions. Deterministic:
    /chat validates citations against exactly this subset.
    """
    catalog = signal_catalog(analysis)
    laps, codes = _question_focus(analysis, question, focused_driver)

    def score(item: tuple[str, EngineerNote]) -> tuple[int, int]:
        sid, n = item
        pts = _SEVERITY.get(n.severity, 0)
        if n.lap_number is not None and any(abs(n.lap_number - lap) <= LAP_WINDOW for lap in laps):
            pts += 4
        text = f"{n.title} {n.message}"
        if any(re.search(rf"\b{code}\b", text) for code in codes):
            pts += 4
        return (-pts, int(sid[1:]))          # highest score first, then catalogue order

    ranked = sorted(catalog.items(), key=score)
    # First pass: at most MAX_PER_GROUP notes of the same kind on the same lap
    # (kind = type + title with driver codes stripped, so "X slow stop L27" and
    # "X pitted under SC/VSC — L27" are different kinds) — a handful of
    # same-shaped notes from one pit cycle must not crowd out the SC two laps later.
    chosen: list[tuple[str, EngineerNote]] = []
    per_group: dict[tuple[str, int | None, str], int] = {}
    leftovers: list[tuple[str, EngineerNote]] = []
    for sid, n in ranked:
        key = (n.type, n.lap_number, _CODE_RE.sub("", n.title).strip()[:24])
        if per_group.get(key, 0) < MAX_PER_GROUP:
            per_group[key] = per_group.get(key, 0) + 1
            chosen.append((sid, n))
        else:
            leftovers.append((sid, n))
        if len(chosen) == limit:
            break
    chosen.extend(leftovers[: limit - len(chosen)])
    return dict(sorted(chosen, key=lambda kv: int(kv[0][1:])))


def build_chat_context(
    analysis: FullRaceAnalysis,
    focused_driver: str | None = None,
    question: str | None = None,
) -> str:
    """
    Return a compact JSON string summarising the race analysis.
    When focused_driver is set, driver-specific data is appended; the
    engineer notes sent are select_signals(analysis, question, focused_driver).
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
                "median_pace_seconds": r.median_clean_lap,
                "best_clean_lap_seconds": r.fastest_clean_lap,
                "true_pace_rank": r.rank,
                "starting_grid_position": r.grid_position,
                "actual_race_finish_position": r.finishing_position,
                "positions_gained": r.positions_gained,
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
        # Largest pit-cycle gains/losses (racing and SC stops; red-flag holds excluded).
        # lane = pit lane seconds, type = racing | safety_car.
        "pit_winners": [
            {"driver": r.driver_code, "lap": r.lap_number, "delta": r.net_position_change,
             "lane": r.lane_duration, "type": r.stop_type}
            for r in sorted(analysis.pit_impact, key=lambda r: (-(r.net_position_change or 0), r.lap_number))
            if (r.net_position_change or 0) > 0 and r.lane_duration and r.stop_type != "red_flag"
        ][:5],
        "pit_losers": [
            {"driver": r.driver_code, "lap": r.lap_number, "delta": r.net_position_change,
             "lane": r.lane_duration, "type": r.stop_type}
            for r in sorted(analysis.pit_impact, key=lambda r: (r.net_position_change or 0, r.lap_number))
            if (r.net_position_change or 0) < 0 and r.lane_duration and r.stop_type != "red_flag"
        ][:5],
        # Pit cycles: the unit position deltas are read on (see pit_cycle_service)
        "pit_cycles": [
            {
                "laps": f"L{c.lap_start}–{c.lap_end}",
                "read_at": c.close_lap,
                "stops": c.stops,
                "neutralised": c.neutralised,
                "gained": [f"{p.driver_code} {p.delta:+d}" for p in sorted(c.participants, key=lambda p: -p.delta)[:3] if p.delta > 0],
                "lost": [f"{p.driver_code} {p.delta:+d}" for p in sorted(c.participants, key=lambda p: p.delta)[:3] if p.delta < 0],
                "undercuts": [f"{u.attacker}>{u.target}" for u in c.undercuts][:4],
            }
            for c in analysis.pit_cycles if c.stops >= 2
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
        # Engineer notes relevant to this question, with their catalogue ids —
        # cite ids from here, nothing else.
        "signals": [
            {
                "id": sid,
                "lap": n.lap_number,
                "type": n.type,
                "severity": n.severity,
                "title": n.title,
                "message": n.message,
            }
            for sid, n in select_signals(analysis, question, focused_driver).items()
        ],
    }

    # Grid-to-finish movement — the only place the starting grid appears, so
    # questions about where drivers started are answerable from data, not guessed.
    if analysis.race_classification:
        movers = [r for r in analysis.race_classification if r.positions_gained is not None]
        if movers:
            ctx["grid_to_finish"] = {
                "biggest_gainers": [
                    {
                        "driver": r.driver_code,
                        "started": r.grid_position,
                        "finished": r.finishing_position,
                        "positions_gained": r.positions_gained,
                    }
                    for r in sorted(movers, key=lambda x: -(x.positions_gained or 0))[:3]
                ],
                "biggest_losers": [
                    {
                        "driver": r.driver_code,
                        "started": r.grid_position,
                        "finished": r.finishing_position,
                        "positions_gained": r.positions_gained,
                    }
                    for r in sorted(movers, key=lambda x: (x.positions_gained or 0))[:3]
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
                "true_pace_rank": driver_pace.rank,
                "starting_grid_position": driver_pace.grid_position,
                "actual_race_finish_position": driver_pace.finishing_position,
                "positions_gained": driver_pace.positions_gained,
                "median_pace_seconds": driver_pace.median_clean_lap,
                "best_clean_lap_seconds": driver_pace.fastest_clean_lap,
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
                "type": r.stop_type,
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
