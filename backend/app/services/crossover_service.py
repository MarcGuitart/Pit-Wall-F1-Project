"""
Crossover Window Detector + Weather Winners & Losers (V4-03).

CRITICAL RULE: If concurrent_sc=True, the summary MUST note that SC timing
contributed — never attribute position gains to weather alone when SC was active.
"""
from __future__ import annotations

from app.domain.models import (
    CrossoverWindow, WeatherWinner, WeatherLoser,
    WeatherWinnersLosers, PitImpactRow,
)
from app.domain.race_timeline import RaceTimeline


# ── Helpers ────────────────────────────────────────────────────────────────


def _compute_crossover_impact(from_cond: str, to_cond: str) -> str:
    if {from_cond, to_cond} == {"DRY", "WET"} or (from_cond == "WET" and to_cond == "DRY"):
        return "High"
    if "DAMP" in (from_cond, to_cond) and "WET" in (from_cond, to_cond):
        return "Medium"
    if from_cond == "DRY" and to_cond == "DAMP":
        return "Medium"
    return "Low"


def _confidence_for_crossover(
    from_cond: str, to_cond: str, concurrent_sc: bool
) -> str:
    if {from_cond, to_cond} in ({"DRY", "WET"},):
        base = "High"
    else:
        base = "Medium"
    # SC concurrent: downgrade one level
    if concurrent_sc:
        if base == "High":
            return "Medium"
        return "Low"
    return base


def _generate_crossover_summary(
    from_cond: str,
    to_cond: str,
    lap_start: int,
    lap_end: int,
    best_timed: list[str],
    late: list[str],
    concurrent_sc: bool,
) -> str:
    base = (
        f"Track shifted from {from_cond} to {to_cond} around lap {lap_start}. "
        f"Optimal pit window: laps {lap_start}–{lap_end}."
    )
    if best_timed:
        base += f" Best timed: {', '.join(best_timed[:3])}."
    if late:
        base += f" Stayed out late: {', '.join(late[:3])}."
    if concurrent_sc:
        base += (
            " This transition coincided with a safety car — position gains should be "
            "attributed to SC timing, not tyre choice alone."
        )
    return base


# ── Crossover window detection ─────────────────────────────────────────────


def detect_crossover_windows(
    timeline: RaceTimeline,
    stints: list[dict],
    pit_impact: list[PitImpactRow],
) -> list[CrossoverWindow]:
    """
    Find condition transitions in the timeline and classify drivers as
    best-timed, late, or early based on when they pitted.
    """
    windows: list[CrossoverWindow] = []
    laps = sorted(timeline.laps.values(), key=lambda s: s.lap_number)

    if len(laps) < 2:
        return []

    # Build a set of driver codes who pitted on each lap
    pits_by_lap: dict[int, list[str]] = {}
    for p in pit_impact:
        pits_by_lap.setdefault(p.lap_number, []).append(p.driver_code)

    # Build a set of all driver codes from pit_impact
    all_drivers = {p.driver_code for p in pit_impact}

    for i in range(1, len(laps)):
        prev, curr = laps[i - 1], laps[i]

        if prev.condition == curr.condition:
            continue

        # Crossover detected at this lap
        lap_start = max(1, curr.lap_number - 2)
        lap_end   = min(timeline.total_laps, curr.lap_number + 4)
        window_laps = timeline.range(lap_start, lap_end)

        # Concurrent SC/VSC check
        concurrent_sc = any(s.sc_active or s.vsc_active for s in window_laps)

        # Who pitted in this window?
        drivers_in_window: set[str] = set()
        for ln in range(lap_start, lap_end + 1):
            drivers_in_window.update(pits_by_lap.get(ln, []))

        # Classify timing:
        # "best_timed" = pitted in lap_start..lap_start+2 (early in window)
        best_timed: list[str] = []
        for ln in range(lap_start, min(lap_start + 3, lap_end + 1)):
            best_timed.extend(pits_by_lap.get(ln, []))

        # "late" = pitted after lap_end (stayed out past the window)
        late: list[str] = []
        for ln in range(lap_end + 1, min(lap_end + 5, timeline.total_laps + 1)):
            late.extend(pits_by_lap.get(ln, []))

        # "early" = pitted before lap_start
        early: list[str] = []
        for ln in range(max(1, lap_start - 4), lap_start):
            early.extend(pits_by_lap.get(ln, []))

        # Deduplicate (driver can appear in multiple laps)
        best_timed = list(dict.fromkeys(best_timed))[:5]
        late = list(dict.fromkeys(late))[:5]
        early = list(dict.fromkeys(early))[:5]

        impact = _compute_crossover_impact(prev.condition, curr.condition)

        windows.append(CrossoverWindow(
            lap_start=lap_start,
            lap_end=lap_end,
            from_condition=prev.condition,
            to_condition=curr.condition,
            impact=impact,  # type: ignore[arg-type]
            best_timed_drivers=best_timed,
            late_drivers=late,
            early_drivers=early,
            concurrent_sc=concurrent_sc,
            summary=_generate_crossover_summary(
                prev.condition, curr.condition,
                lap_start, lap_end,
                best_timed, late, concurrent_sc,
            ),
        ))

    return windows


# ── Weather winners & losers ────────────────────────────────────────────────


def _find_pit_in_range(
    driver_code: str,
    lap_start: int,
    lap_end: int,
    pit_impact: list[PitImpactRow],
) -> PitImpactRow | None:
    for p in pit_impact:
        if p.driver_code == driver_code and lap_start <= p.lap_number <= lap_end:
            return p
    return None


def compute_weather_winners_losers(
    crossover_windows: list[CrossoverWindow],
    pit_impact: list[PitImpactRow],
    positions: list[dict],
    race_control: list[dict],
    timeline: RaceTimeline,
) -> WeatherWinnersLosers | None:
    """
    Compute weather winners and losers from crossover windows.
    Always notes concurrent SC to avoid false attribution.
    Max 3 winners, max 3 losers, sorted by magnitude.
    """
    if not crossover_windows:
        return None

    winners: list[WeatherWinner] = []
    losers: list[WeatherLoser] = []
    any_concurrent_sc = False

    for window in crossover_windows:
        if window.concurrent_sc:
            any_concurrent_sc = True
            reason_prefix = "pitted at SC/weather crossover"
            confidence: str = "Medium"
        else:
            reason_prefix = "pitted inside crossover window"
            confidence = "High"

        # Best-timed drivers = potential winners
        for driver in window.best_timed_drivers:
            pit_row = _find_pit_in_range(driver, window.lap_start, window.lap_end, pit_impact)
            if pit_row and (pit_row.net_position_change or 0) > 0:
                winners.append(WeatherWinner(
                    driver_code=driver,
                    gain=f"+{pit_row.net_position_change} positions",
                    reason=reason_prefix,
                    confidence=confidence,  # type: ignore[arg-type]
                ))

        # Late drivers = potential losers
        for driver in window.late_drivers:
            # Find any pit they made after the window
            late_pits = [
                p for p in pit_impact
                if p.driver_code == driver and p.lap_number > window.lap_end
            ]
            if late_pits:
                pit_row = late_pits[0]
                if (pit_row.net_position_change or 0) < 0:
                    losers.append(WeatherLoser(
                        driver_code=driver,
                        loss=f"{pit_row.net_position_change} positions",
                        reason=f"stayed out after track moved to {window.to_condition}",
                        confidence="Medium",
                    ))

    # Sort by magnitude and cap at 3 each
    winners.sort(key=lambda w: -int(w.gain.split()[0].lstrip("+")))
    losers.sort(key=lambda l: int(l.loss.split()[0]))
    winners = winners[:3]
    losers  = losers[:3]

    if not winners and not losers:
        return None

    # Overall confidence
    overall_conf: str = "High"
    if any_concurrent_sc or all(w.confidence == "Medium" for w in winners):
        overall_conf = "Medium"
    if not winners and losers:
        overall_conf = "Low"

    attribution_note: str | None = None
    if any_concurrent_sc:
        attribution_note = (
            "Some position changes occurred during SC/weather overlap — "
            "attribution to weather alone may overstate its impact."
        )

    return WeatherWinnersLosers(
        winners=winners,
        losers=losers,
        confidence=overall_conf,  # type: ignore[arg-type]
        attribution_note=attribution_note,
    )
