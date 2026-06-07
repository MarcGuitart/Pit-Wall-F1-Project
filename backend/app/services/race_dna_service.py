"""
Race DNA — deterministic 8-point fingerprint of a race.
No LLM, no randomness. Output is fully reproducible from input data.
"""
from __future__ import annotations

import statistics

from app.domain.models import (
    RaceDNA, ChaosIndex, WeatherAnalysis,
    MeaningfulDRSTrain, TruePaceRow, TyreDegradationRow,
    PitImpactRow, RacePhase,
)


def _classify_tyre_impact(avg_slope: float) -> str:
    if avg_slope >= 0.07:
        return "High"
    if avg_slope >= 0.04:
        return "Medium"
    return "Low"


def _derive_secondary_factor(
    chaos: ChaosIndex,
    meaningful_trains: list[MeaningfulDRSTrain],
    tyre_degradation: list[TyreDegradationRow],
    primary: str = "",
) -> str:
    """Return the second-biggest race influence, never duplicating primary."""
    factors: list[tuple[str, int]] = []

    sc_score = chaos.components.safety_car
    if sc_score >= 10:
        factors.append(("Safety Car Timing", sc_score))

    if any(t.impact in ("High", "Medium") for t in meaningful_trains):
        factors.append(("Track Position / DRS", 15 if any(t.impact == "High" for t in meaningful_trains) else 8))

    if chaos.components.weather >= 10:
        factors.append(("Weather", chaos.components.weather))

    if tyre_degradation:
        avg_slope = statistics.mean(r.degradation_slope for r in tyre_degradation)
        if avg_slope >= 0.06:
            factors.append(("Tyre Degradation", int(avg_slope * 200)))

    if chaos.components.investigations + chaos.components.penalties >= 3:
        factors.append(("Race Control Incidents", chaos.components.investigations + chaos.components.penalties))

    # Remove factors already covered by primary (avoid duplicate labels)
    filtered = [(name, score) for name, score in factors if name not in primary]

    if not filtered:
        return "Tyre Management"

    filtered.sort(key=lambda x: -x[1])
    return filtered[0][0]


def compute_race_dna(
    chaos: ChaosIndex,
    weather_analysis: WeatherAnalysis | None,
    meaningful_trains: list[MeaningfulDRSTrain],
    pace_rows: list[TruePaceRow],
    tyre_degradation: list[TyreDegradationRow],
    pit_impact: list[PitImpactRow],
    phases: list[RacePhase],
) -> RaceDNA:
    """
    Deterministic 8-point race fingerprint.
    Priority logic: Weather + SC > Weather > SC > DRS > Pace.
    """
    # ── Primary factor ────────────────────────────────────────────────────────
    has_high_sc = chaos.components.safety_car >= 20
    has_high_weather = (
        weather_analysis is not None
        and weather_analysis.strategy_impact == "High"
    )
    has_high_drs = (
        any(t.impact == "High" for t in meaningful_trains)
        and len(meaningful_trains) >= 2
    )

    if has_high_weather and has_high_sc:
        primary = "Weather + Safety Car"
    elif has_high_weather:
        primary = "Weather Strategy"
    elif has_high_sc:
        primary = "Safety Car Timing"
    elif has_high_drs:
        primary = "Track Position / DRS"
    else:
        primary = "Pace"

    # ── Secondary factor ──────────────────────────────────────────────────────
    secondary = _derive_secondary_factor(chaos, meaningful_trains, tyre_degradation, primary)

    # ── Strategy type ─────────────────────────────────────────────────────────
    avg_slope = (
        statistics.mean(r.degradation_slope for r in tyre_degradation)
        if tyre_degradation else 0.0
    )

    if avg_slope >= 0.06:
        strategy_type = "Tyre degradation race"
    elif primary in ("Track Position / DRS",):
        strategy_type = "Track position race"
    elif primary in ("Weather Strategy", "Weather + Safety Car"):
        strategy_type = "Crossover strategy race"
    elif has_high_sc:
        strategy_type = "Safety car lottery"
    else:
        strategy_type = "Pace management race"

    # ── Overtaking difficulty ─────────────────────────────────────────────────
    if any(t.peak_length >= 8 for t in meaningful_trains):
        overtaking: str = "High"
    elif meaningful_trains:
        overtaking = "Medium"
    else:
        overtaking = "Low"

    # ── Pit timing sensitivity ────────────────────────────────────────────────
    max_delta = max(
        (abs(p.net_position_change or 0) for p in pit_impact),
        default=0,
    )
    if max_delta >= 3:
        pit_sensitivity: str = "Extreme"
    elif max_delta >= 2:
        pit_sensitivity = "High"
    else:
        pit_sensitivity = "Medium"

    return RaceDNA(
        primary_factor=primary,
        secondary_factor=secondary,
        strategy_type=strategy_type,
        overtaking_difficulty=overtaking,         # type: ignore[arg-type]
        pit_timing_sensitivity=pit_sensitivity,   # type: ignore[arg-type]
        tyre_degradation_impact=_classify_tyre_impact(avg_slope),  # type: ignore[arg-type]
        chaos_level=chaos.level,
    )
