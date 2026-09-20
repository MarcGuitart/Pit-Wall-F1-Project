"""
Regression tests on real cached sessions (backend/cache/<key>/*.json).

9539 — España 2024: dry race with a single flagged minute at 13:06 UTC.
       Must produce no rain anywhere in the pipeline.
9636 — São Paulo 2024: genuinely wet race. Must still be detected as such,
       without the flag flicker inflating the number of rain periods.
"""
from __future__ import annotations

import pytest

from app.services.chaos_service import compute_chaos_index
from app.services.crossover_service import detect_crossover_windows
from app.services.notes_service import _weather_notes
from app.services.timeline_builder import build_race_timeline
from app.services.weather_conditions import detect_rain_periods
from app.services.weather_service import compute_weather_analysis


def _timeline(key: int, d: dict) -> object:
    return build_race_timeline(
        laps_data=d["laps"], weather_data=d["weather"], race_control_data=d["race_control"],
        pit_data=d["pit"], interval_data=d["intervals"], position_data=d["position"],
        session_key=key,
    )


# ── 9539: dry race, one-minute sensor blip ────────────────────────────────────

@pytest.fixture
def esp(session_data):
    return session_data(9539)


def test_9539_has_no_rain_periods(esp):
    assert detect_rain_periods(esp["weather"], esp["laps"]) == []


def test_9539_emits_no_rain_notes(esp):
    assert _weather_notes(esp["weather"], esp["laps"]) == []


def test_9539_chaos_weather_component_is_zero(esp):
    chaos = compute_chaos_index(_timeline(9539, esp), esp["race_control"], esp["laps"], esp["position"], esp["pit"])
    assert chaos.components.weather == 0
    assert chaos.breakdown["weather"].raw == 0
    assert "wet" not in chaos.summary


def test_9539_has_no_weather_crossovers(esp):
    timeline = _timeline(9539, esp)
    assert timeline.wet_laps() == set()
    assert detect_crossover_windows(timeline, esp["stints"], []) == []


def test_9539_weather_analysis_is_a_dry_race(esp):
    wa = compute_weather_analysis(esp["weather"], esp["laps"])
    assert wa is not None
    assert wa.wet_laps == 0
    assert wa.strategy_impact == "None"
    assert "significantly" not in wa.summary
    assert not [e for e in wa.events if e.event_type in ("RAIN_ONSET", "RAIN_END")]


# ── 9636: real wet race ───────────────────────────────────────────────────────

@pytest.fixture
def bra(session_data):
    return session_data(9636)


def test_9636_still_detects_rain_with_a_sane_period_count(bra):
    periods = detect_rain_periods(bra["weather"], bra["laps"])
    assert 1 <= len(periods) <= 2          # was 6 with per-record transitions
    assert sum(p.record_count for p in periods) >= 60   # most of the race was wet


def test_9636_rain_notes_match_periods(bra):
    notes = _weather_notes(bra["weather"], bra["laps"])
    periods = detect_rain_periods(bra["weather"], bra["laps"])
    assert len(notes) == len(periods)
    assert notes[0].lap_number == 1        # raining from the start


def test_9636_chaos_weather_component_is_high(bra):
    chaos = compute_chaos_index(_timeline(9636, bra), bra["race_control"], bra["laps"], bra["position"], bra["pit"])
    assert chaos.breakdown["weather"].raw > 0.6      # ~72 % of laps wet
    assert chaos.components.weather >= 18
    assert chaos.level == "Extreme"


def test_9636_weather_analysis_is_still_high_impact(bra):
    wa = compute_weather_analysis(bra["weather"], bra["laps"])
    assert wa is not None
    assert wa.wet_laps >= 40
    assert wa.strategy_impact == "High"
    assert "significantly influenced" in wa.summary


def test_9636_timeline_has_wet_laps_and_crossovers(bra):
    timeline = _timeline(9636, bra)
    assert len(timeline.wet_laps()) >= 40
    assert {s.condition for s in timeline.laps.values()} <= {"DRY", "WET"}
    assert detect_crossover_windows(timeline, bra["stints"], []) != []
