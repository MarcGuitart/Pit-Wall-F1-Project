"""5 Key Race Decisions — ranked by impact magnitude.

Ranking priority:
  1. Biggest net position gain/loss from a pit stop
  2. Highest cliff-risk tyre stint (if caused visible pace loss)
  3. Undercut outcome (if detectable)
  4. Peak chaos event
  5. True pace hierarchy / strategy summary
"""
from __future__ import annotations

from app.domain.models import RaceDecision, PitImpactRow, TyreDegradationRow, ChaosIndex


def _pit_decisions(pit_impact: list[PitImpactRow], rank_start: int) -> list[RaceDecision]:
    decisions: list[RaceDecision] = []
    # Only include stops with valid stationary time (exclude red-flag holds)
    valid_pits = [
        p for p in pit_impact
        if p.net_position_change is not None
        and p.stop_duration is not None
        and p.stop_duration > 0.5
    ]
    # Prefer gains first, then losses — sort by signed delta descending (gains at top)
    pits_sorted = sorted(valid_pits, key=lambda p: abs(p.net_position_change or 0), reverse=True)

    for stop in pits_sorted[:2]:
        delta = stop.net_position_change or 0
        if delta > 0:
            impact_str = f"+{delta} position{'s' if delta != 1 else ''}"
        elif delta < 0:
            impact_str = f"{delta} position{'s' if abs(delta) != 1 else ''}"
        else:
            impact_str = "Neutral"

        if stop.position_before and stop.position_after and stop.lane_duration:
            explanation = (
                f"{stop.driver_code} pitted on lap {stop.lap_number} "
                f"({stop.lane_duration:.1f}s lane time). "
                f"Emerged P{stop.position_after} from P{stop.position_before}. "
                f"{stop.verdict}"
            )
        else:
            explanation = stop.verdict

        decisions.append(
            RaceDecision(
                rank=rank_start + len(decisions),
                lap_number=stop.lap_number,
                title=f"{stop.driver_code} pit L{stop.lap_number}",
                impact=impact_str,
                explanation=explanation,
                confidence=stop.confidence,
            )
        )
    return decisions


def _tyre_decisions(degradation: list[TyreDegradationRow], rank: int) -> list[RaceDecision]:
    cliffs = sorted(
        [s for s in degradation if s.cliff_risk == "High"],
        key=lambda s: s.degradation_slope,
        reverse=True,
    )
    if not cliffs:
        return []
    worst = cliffs[0]
    lap_count = worst.lap_end - worst.lap_start + 1
    return [
        RaceDecision(
            rank=rank,
            lap_number=worst.lap_end,
            title=f"{worst.driver_code} {worst.compound} — {lap_count} lap stint",
            impact=f"+{worst.degradation_slope:.3f}s/lap degradation (High cliff)",
            explanation=(
                f"{worst.driver_code} ran {worst.compound} for {lap_count} laps "
                f"(L{worst.lap_start}–{worst.lap_end}). "
                f"Linear slope +{worst.degradation_slope:.3f}s/lap — High cliff risk. "
                f"Data confidence: {worst.confidence}."
            ),
            confidence=worst.confidence,
        )
    ]


def _chaos_decision(chaos: ChaosIndex, rank: int) -> RaceDecision:
    return RaceDecision(
        rank=rank,
        lap_number=chaos.peak_chaos_lap,
        title=f"Race chaos peak — L{chaos.peak_chaos_lap}",
        impact=f"Chaos {chaos.score}/100 ({chaos.level})",
        explanation=chaos.summary,
        confidence="High",
    )


def _pace_summary(true_pace_count: int, rank: int) -> RaceDecision:
    return RaceDecision(
        rank=rank,
        lap_number=None,
        title="Pace hierarchy established",
        impact=f"{true_pace_count} drivers analysed",
        explanation=(
            f"True pace ranking computed from {true_pace_count} drivers. "
            "SC, pit in/out, and statistical outlier laps excluded. "
            "Ranking reflects clean-air single-lap representative pace."
        ),
        confidence="High",
    )


def compute_decisions(
    pit_impact: list[PitImpactRow],
    degradation: list[TyreDegradationRow],
    chaos: ChaosIndex,
    true_pace_count: int,
) -> list[RaceDecision]:
    decisions: list[RaceDecision] = []

    pit_dec = _pit_decisions(pit_impact, rank_start=1)
    decisions.extend(pit_dec)

    tyre_dec = _tyre_decisions(degradation, rank=len(decisions) + 1)
    decisions.extend(tyre_dec)

    if len(decisions) < 5 and chaos.peak_chaos_lap:
        decisions.append(_chaos_decision(chaos, rank=len(decisions) + 1))

    if len(decisions) < 5:
        decisions.append(_pace_summary(true_pace_count, rank=len(decisions) + 1))

    # Re-number to be safe
    for i, d in enumerate(decisions[:5]):
        d.rank = i + 1

    return decisions[:5]
