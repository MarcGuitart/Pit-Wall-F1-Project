"""Weather Analysis — correlates OpenF1 weather data with lap timing."""
from __future__ import annotations

import statistics

from app.domain.models import (
    WeatherAnalysis, WeatherEvent, WeatherLap,
)
from app.services.weather_conditions import (
    DRY, WET, detect_rain_periods, lap_for_time, lap_time_index, parse_ts, wet_lap_numbers,
)


def compute_weather_analysis(
    weather: list[dict],
    laps: list[dict],
) -> WeatherAnalysis | None:
    """
    Correlate OpenF1 weather records with lap numbers.
    Returns None if no meaningful weather data available.
    """
    if not weather or not laps:
        return None

    # Build lap time index for timestamp→lap mapping
    lap_index = lap_time_index(laps)
    if not lap_index:
        return None

    total_laps = lap_index[-1][0]

    # Wet/dry per lap comes from weather_conditions (shared with every service)
    wet_laps_set = wet_lap_numbers(detect_rain_periods(weather, laps), lap_index)

    # ── Assign each weather record to a lap (for temperatures) ───────────────
    lap_weather: dict[int, list[dict]] = {}
    for w in weather:
        t = parse_ts(w.get("date"))
        if not t:
            continue
        ln = lap_for_time(t, lap_index)
        if ln is None:
            continue
        lap_weather.setdefault(ln, []).append(w)

    if not lap_weather:
        return None

    # ── Per-lap aggregation ───────────────────────────────────────────────────
    lap_conditions: list[WeatherLap] = []
    for ln in sorted(lap_weather.keys()):
        records = lap_weather[ln]
        track_temps = [r["track_temperature"] for r in records if r.get("track_temperature") is not None]
        air_temps   = [r["air_temperature"]   for r in records if r.get("air_temperature")   is not None]

        if not track_temps:
            continue

        is_wet = ln in wet_laps_set
        lap_conditions.append(WeatherLap(
            lap_number=ln,
            track_temp=round(statistics.mean(track_temps), 1),
            air_temp=round(statistics.mean(air_temps), 1) if air_temps else 0.0,
            rainfall=1.0 if is_wet else 0.0,
            condition=WET if is_wet else DRY,
        ))

    if not lap_conditions:
        return None

    # ── Global stats ──────────────────────────────────────────────────────────
    dry_laps  = sum(1 for l in lap_conditions if l.condition == DRY)
    wet_laps  = sum(1 for l in lap_conditions if l.condition == WET)

    all_track_temps = [l.track_temp for l in lap_conditions]
    avg_track_temp  = round(statistics.mean(all_track_temps), 1)
    min_track_temp  = round(min(all_track_temps), 1)
    max_track_temp  = round(max(all_track_temps), 1)

    # ── Detect transitions ────────────────────────────────────────────────────
    events: list[WeatherEvent] = []
    prev_condition = lap_conditions[0].condition

    for i, lc in enumerate(lap_conditions):
        curr = lc.condition

        # Rain onset
        if prev_condition == DRY and curr == WET:
            events.append(WeatherEvent(
                lap_number=lc.lap_number,
                event_type="RAIN_ONSET",
                track_temp=lc.track_temp,
                air_temp=lc.air_temp,
                rainfall=lc.rainfall,
                message=(
                    f"Lap {lc.lap_number} — Rain onset. "
                    f"Track {lc.track_temp}°C · Air {lc.air_temp}°C. "
                    f"Intermediate/Wet tyre window opens."
                ),
            ))

        # Rain ending
        elif prev_condition == WET and curr == DRY:
            events.append(WeatherEvent(
                lap_number=lc.lap_number,
                event_type="RAIN_END",
                track_temp=lc.track_temp,
                air_temp=lc.air_temp,
                rainfall=0.0,
                message=(
                    f"Lap {lc.lap_number} — Rain clearing. "
                    f"Track drying. Slick tyre window opens."
                ),
            ))

        # Temperature spike (>3°C jump)
        if i > 0:
            prev_track = lap_conditions[i - 1].track_temp
            delta = lc.track_temp - prev_track
            if delta >= 3.0:
                events.append(WeatherEvent(
                    lap_number=lc.lap_number,
                    event_type="TEMP_SPIKE",
                    track_temp=lc.track_temp,
                    air_temp=lc.air_temp,
                    rainfall=lc.rainfall,
                    message=(
                        f"Lap {lc.lap_number} — Track temperature +{delta:.1f}°C spike "
                        f"({prev_track:.0f}°C → {lc.track_temp:.0f}°C). "
                        f"Tyre degradation risk increases."
                    ),
                ))
            elif delta <= -3.0:
                events.append(WeatherEvent(
                    lap_number=lc.lap_number,
                    event_type="TEMP_DROP",
                    track_temp=lc.track_temp,
                    air_temp=lc.air_temp,
                    rainfall=lc.rainfall,
                    message=(
                        f"Lap {lc.lap_number} — Track temperature drop {delta:.1f}°C "
                        f"({prev_track:.0f}°C → {lc.track_temp:.0f}°C). "
                        f"Grip levels changing."
                    ),
                ))

        prev_condition = curr

    # No PEAK_RAIN event: rainfall is a 0/1 flag, it has no peak.

    events.sort(key=lambda e: e.lap_number or 0)

    # ── Strategy impact ───────────────────────────────────────────────────────
    rain_transitions = sum(1 for e in events if e.event_type in ("RAIN_ONSET", "RAIN_END"))
    temp_events      = sum(1 for e in events if e.event_type in ("TEMP_SPIKE", "TEMP_DROP"))
    if wet_laps >= total_laps * 0.4 or rain_transitions >= 3:
        strategy_impact = "High"
    elif wet_laps >= 5:
        strategy_impact = "Medium"
    elif wet_laps > 0 or temp_events > 0:
        strategy_impact = "Low"
    else:
        strategy_impact = "None"

    # ── Summary — one sentence per strategy_impact level, never independent ──
    conditions = (
        f"Dry race. Track temperature ranged {min_track_temp}–{max_track_temp}°C."
        if wet_laps == 0 else
        f"Predominantly wet race. {wet_laps} wet laps. Track {min_track_temp}–{max_track_temp}°C."
        if wet_laps >= total_laps * 0.6 else
        f"Mixed conditions: {dry_laps} dry, {wet_laps} wet laps. Track {min_track_temp}–{max_track_temp}°C."
    )
    impact_sentence = {
        "None":   "No weather strategy impact.",
        "Low":    (
            f"{temp_events} track temperature swing(s); minimal weather strategy impact."
            if wet_laps == 0 else
            f"Brief rain ({wet_laps} lap(s)); minimal weather strategy impact."
        ),
        "Medium": f"{rain_transitions} rain transition(s); weather shaped part of the strategy.",
        "High":   f"{rain_transitions} rain transition(s); strategy significantly influenced by weather.",
    }[strategy_impact]
    summary = f"{conditions} {impact_sentence}"

    return WeatherAnalysis(
        dry_laps=dry_laps,
        wet_laps=wet_laps,
        avg_track_temp=avg_track_temp,
        min_track_temp=min_track_temp,
        max_track_temp=max_track_temp,
        peak_rainfall_lap=None,
        events=events,
        lap_conditions=lap_conditions,
        strategy_impact=strategy_impact,  # type: ignore[arg-type]
        summary=summary,
    )
