"""
Race Phase Classifier — divides a race into labeled strategic segments.
Priority order: SC > VSC > Weather > DRS > Final Push > Pit Window > Start > Racing
"""
from __future__ import annotations

from app.domain.models import (
    RacePhase, TyreDegradationRow, PitImpactRow,
    CrossoverWindow, MeaningfulDRSTrain,
)
from app.domain.race_timeline import RaceTimeline

PHASE_PRIORITY: dict[str, int] = {
    "Safety Car Reset":      10,
    "VSC Period":            9,
    "Weather Crossover":     8,
    "DRS Train Compression": 7,
    "Final Push":            6,
    "Pit Window":            5,
    "Degradation Phase":     4,
    "Tyre Management":       3,
    "Start / Sorting":       2,
    "Racing":                1,
}

PHASE_COLOR: dict[str, str] = {
    "Safety Car Reset":      "amber",
    "VSC Period":            "red",
    "Weather Crossover":     "blue",
    "DRS Train Compression": "purple",
    "Final Push":            "green",
    "Pit Window":            "green",
    "Degradation Phase":     "amber",
    "Tyre Management":       "muted",
    "Start / Sorting":       "muted",
    "Racing":                "muted",
}


def find_contiguous_periods(
    timeline: RaceTimeline,
    predicate,
) -> list[tuple[int, int]]:
    """Group consecutive laps where predicate(lap_signals) is True."""
    periods: list[tuple[int, int]] = []
    start: int | None = None

    for lap_num in sorted(timeline.laps.keys()):
        sig = timeline.laps[lap_num]
        if predicate(sig):
            if start is None:
                start = lap_num
        else:
            if start is not None:
                periods.append((start, lap_num - 1))
                start = None

    if start is not None:
        periods.append((start, max(timeline.laps.keys())))

    return periods


def find_clusters(
    pit_laps: list[int], gap: int = 3
) -> list[tuple[int, int]]:
    """Group lap numbers within `gap` of each other into (start, end) clusters."""
    if not pit_laps:
        return []
    sorted_laps = sorted(set(pit_laps))
    clusters: list[tuple[int, int]] = []
    seg_start = sorted_laps[0]
    prev = sorted_laps[0]

    for lap in sorted_laps[1:]:
        if lap - prev <= gap:
            prev = lap
        else:
            clusters.append((seg_start, prev))
            seg_start = lap
            prev = lap
    clusters.append((seg_start, prev))
    return clusters


def resolve_phase_overlaps(
    phases: list[RacePhase],
    priority_map: dict[str, int],
) -> list[RacePhase]:
    """For each lap, keep the highest-priority phase. Then regroup into segments."""
    if not phases:
        return []

    lap_phase: dict[int, RacePhase] = {}
    for phase in phases:
        p = priority_map.get(phase.phase, 0)
        for lap in range(phase.lap_start, phase.lap_end + 1):
            existing = lap_phase.get(lap)
            if existing is None or p > priority_map.get(existing.phase, 0):
                lap_phase[lap] = phase

    if not lap_phase:
        return []

    sorted_laps = sorted(lap_phase.keys())
    result: list[RacePhase] = []
    seg_start = sorted_laps[0]
    seg_phase = lap_phase[sorted_laps[0]]
    prev = sorted_laps[0]

    for i in range(1, len(sorted_laps)):
        lap = sorted_laps[i]
        curr = lap_phase[lap]
        if curr.phase == seg_phase.phase and lap == prev + 1:
            prev = lap
        else:
            result.append(RacePhase(
                lap_start=seg_start, lap_end=prev,
                phase=seg_phase.phase, impact=seg_phase.impact,
                reason=seg_phase.reason, color_token=seg_phase.color_token,
            ))
            seg_start = lap
            seg_phase = curr
            prev = lap

    result.append(RacePhase(
        lap_start=seg_start, lap_end=prev,
        phase=seg_phase.phase, impact=seg_phase.impact,
        reason=seg_phase.reason, color_token=seg_phase.color_token,
    ))
    return result


def fill_phase_gaps(
    phases: list[RacePhase], total_laps: int
) -> list[RacePhase]:
    """Add 'Racing' phase for any laps not covered by existing phases."""
    covered: set[int] = set()
    for p in phases:
        covered.update(range(p.lap_start, p.lap_end + 1))

    uncovered = sorted(set(range(1, total_laps + 1)) - covered)
    if not uncovered:
        return phases

    result = list(phases)
    seg_start = uncovered[0]
    prev = uncovered[0]
    for lap in uncovered[1:]:
        if lap == prev + 1:
            prev = lap
        else:
            result.append(RacePhase(
                lap_start=seg_start, lap_end=prev,
                phase="Racing", impact="Low",
                reason="Racing laps", color_token="muted",
            ))
            seg_start = lap
            prev = lap
    result.append(RacePhase(
        lap_start=seg_start, lap_end=prev,
        phase="Racing", impact="Low",
        reason="Racing laps", color_token="muted",
    ))
    return result


def classify_race_phases(
    timeline: RaceTimeline,
    tyre_degradation: list[TyreDegradationRow],
    pit_impact: list[PitImpactRow],
    crossover_windows: list[CrossoverWindow],
    meaningful_trains: list[MeaningfulDRSTrain],
    total_laps: int,
) -> list[RacePhase]:
    phases: list[RacePhase] = []

    # 1. Safety Car periods
    for start, end in find_contiguous_periods(timeline, lambda s: s.sc_active):
        phases.append(RacePhase(
            lap_start=start, lap_end=end,
            phase="Safety Car Reset", impact="High",
            reason="Safety car deployed — field compressed, pit windows opened",
            color_token="amber",
        ))

    # 2. VSC periods
    for start, end in find_contiguous_periods(timeline, lambda s: s.vsc_active):
        phases.append(RacePhase(
            lap_start=start, lap_end=end,
            phase="VSC Period", impact="Medium",
            reason="Virtual safety car — reduced pace, limited pit advantage",
            color_token="red",
        ))

    # 3. Weather crossover windows
    for cw in crossover_windows:
        phases.append(RacePhase(
            lap_start=cw.lap_start, lap_end=cw.lap_end,
            phase="Weather Crossover", impact=cw.impact,
            reason=f"{cw.from_condition} → {cw.to_condition} crossover window",
            color_token="blue",
        ))

    # 4. DRS train compression (High impact only)
    for train in meaningful_trains:
        if train.impact == "High":
            phases.append(RacePhase(
                lap_start=train.lap_start, lap_end=train.lap_end,
                phase="DRS Train Compression", impact="High",
                reason=f"{train.peak_length}-car train — overtaking difficulty high",
                color_token="purple",
            ))

    # 5. Pit window clusters
    pit_laps = sorted(set(p.lap_number for p in pit_impact))
    for cluster_start, cluster_end in find_clusters(pit_laps, gap=3):
        if cluster_end - cluster_start >= 2:
            phases.append(RacePhase(
                lap_start=cluster_start, lap_end=cluster_end,
                phase="Pit Window", impact="Medium",
                reason="Main pit stop sequence",
                color_token="green",
            ))

    # 6. Start / Sorting (laps 1 to first pit or lap 6)
    first_pit_lap = min(pit_laps) if pit_laps else 6
    sort_end = min(first_pit_lap - 1, 6)
    if sort_end >= 1:
        phases.append(RacePhase(
            lap_start=1, lap_end=sort_end,
            phase="Start / Sorting",
            impact="Medium",
            reason="Opening lap order resolving after race start",
            color_token="muted",
        ))

    # 7. Final push (last 10 laps, excluding neutralized laps)
    if total_laps >= 10:
        final_start = total_laps - 9
        neutralized = timeline.neutralized_laps()
        final_laps_non_neutralized = [
            l for l in range(final_start, total_laps + 1)
            if l not in neutralized
        ]
        if len(final_laps_non_neutralized) >= 5:
            phases.append(RacePhase(
                lap_start=final_start, lap_end=total_laps,
                phase="Final Push", impact="High",
                reason="Final stint — gap management and position defence",
                color_token="green",
            ))

    # Resolve overlaps, fill gaps
    phases = resolve_phase_overlaps(phases, PHASE_PRIORITY)
    phases = fill_phase_gaps(phases, total_laps)

    return sorted(phases, key=lambda p: p.lap_start)
