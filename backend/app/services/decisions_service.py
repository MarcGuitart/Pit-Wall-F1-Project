"""5 Key Race Decisions — ranked by impact magnitude.

Ranking priority:
  1. Biggest net position gain/loss from a pit stop
  2. Highest cliff-risk tyre stint (if caused visible pace loss)
  3. Undercut outcome (if detectable)
  4. Peak chaos event
  5. True pace hierarchy / strategy summary
"""
from __future__ import annotations

from app.domain.models import ChaosIndex, PitCycle, PitImpactRow, RaceDecision, TyreDegradationRow


# How much a position delta counts by how the stop happened. A red-flag hold
# is not a decision; an SC/VSC stop is half timing, half neutralisation.
STOP_TYPE_WEIGHT = {"racing": 1.0, "safety_car": 0.5, "red_flag": 0.0}
CYCLE_WEIGHT = 1.5          # a whole pit window outranks a single stop of the same swing
NEUTRALISED_FACTOR = 0.5    # SC/VSC inside the window: attribution unreliable


def _pit_decisions(
    pit_impact: list[PitImpactRow], pit_cycles: list[PitCycle], rank_start: int
) -> list[RaceDecision]:
    """
    Top-2 pit decisions among (a) pit cycles with at least two stoppers, scored
    on the biggest gain plus the biggest loss inside them, and (b) individual
    stops scored on |delta| weighted by stop_type.
    """
    candidates: list[tuple[float, RaceDecision]] = []

    for c in pit_cycles:
        stoppers = [p for p in c.participants if p.stopped]
        if len(stoppers) < 2:
            continue
        gain = max((p.delta for p in c.participants), default=0)
        loss = min((p.delta for p in c.participants), default=0)
        score = CYCLE_WEIGHT * (max(gain, 0) + abs(min(loss, 0)))
        if c.neutralised:
            score *= NEUTRALISED_FACTOR
        top_gain = max(c.participants, key=lambda p: p.delta)
        top_loss = min(c.participants, key=lambda p: p.delta)
        candidates.append((score, RaceDecision(
            rank=0,
            lap_number=c.lap_start,
            title=f"Pit window L{c.lap_start}–{c.lap_end}",
            impact=f"{top_gain.driver_code} {top_gain.delta:+d} · {top_loss.driver_code} {top_loss.delta:+d}",
            explanation=c.summary,
            confidence="Medium" if c.neutralised else "High",
        )))

    for stop in pit_impact:
        delta = stop.net_position_change
        weight = STOP_TYPE_WEIGHT.get(stop.stop_type, 0.0)
        if delta is None or weight == 0.0:
            continue
        score = abs(delta) * weight
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
                f"Emerged P{stop.position_after} from P{stop.position_before} "
                f"at the close of the pit cycle. {stop.verdict}"
            )
        else:
            explanation = stop.verdict
        candidates.append((score, RaceDecision(
            rank=0,
            lap_number=stop.lap_number,
            title=f"{stop.driver_code} pit L{stop.lap_number}",
            impact=impact_str,
            explanation=explanation,
            confidence=stop.confidence,
        )))

    candidates.sort(key=lambda x: -x[0])
    decisions: list[RaceDecision] = []
    for _, d in candidates[:2]:
        d.rank = rank_start + len(decisions)
        decisions.append(d)
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
            "Ranking reflects median clean-lap pace, not a single peak lap."
        ),
        confidence="High",
    )


def compute_decisions(
    pit_impact: list[PitImpactRow],
    degradation: list[TyreDegradationRow],
    chaos: ChaosIndex,
    true_pace_count: int,
    pit_cycles: list[PitCycle] | None = None,
) -> list[RaceDecision]:
    decisions: list[RaceDecision] = []

    pit_dec = _pit_decisions(pit_impact, pit_cycles or [], rank_start=1)
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
