"""Weather Analysis — correlates OpenF1 weather data with lap timing."""
from __future__ import annotations

import statistics
from datetime import datetime, timezone

from app.domain.models import (
    WeatherAnalysis, WeatherEvent, WeatherLap,
)


def _parse_ts(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _build_lap_time_index(laps: list[dict]) -> list[tuple[int, datetime]]:
    """Return sorted [(lap_number, median_start_time), ...] for all laps."""
    from collections import defaultdict
    lap_times: dict[int, list[datetime]] = defaultdict(list)
    for lap in laps:
        ln = lap.get("lap_number")
        ds = _parse_ts(lap.get("date_start"))
        if ln and ds:
            lap_times[ln].append(ds)

    result = []
    for ln, times in lap_times.items():
        times_sorted = sorted(times)
        mid = times_sorted[len(times_sorted) // 2]
        result.append((ln, mid))

    return sorted(result, key=lambda x: x[0])


def _lap_for_time(t: datetime, lap_index: list[tuple[int, datetime]]) -> int | None:
    """Find lap number for a given timestamp using the sorted lap index."""
    if not lap_index:
        return None

    for i, (ln, lt) in enumerate(lap_index):
        if i + 1 < len(lap_index):
            next_lt = lap_index[i + 1][1]
            if lt <= t < next_lt:
                return ln
        else:
            if t >= lt:
                return ln
    return None


def _condition(rainfall: float) -> str:
    if rainfall >= 1.0:
        return "WET"
    if rainfall > 0:
        return "DAMP"
    return "DRY"


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
    lap_index = _build_lap_time_index(laps)
    if not lap_index:
        return None

    total_laps = lap_index[-1][0]

    # ── Assign each weather record to a lap ───────────────────────────────────
    lap_weather: dict[int, list[dict]] = {}
    for w in weather:
        t = _parse_ts(w.get("date"))
        if not t:
            continue
        ln = _lap_for_time(t, lap_index)
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
        rainfalls   = [r.get("rainfall", 0) or 0 for r in records]

        if not track_temps:
            continue

        avg_track = statistics.mean(track_temps)
        avg_air   = statistics.mean(air_temps) if air_temps else 0.0
        avg_rain  = max(rainfalls)  # use peak rainfall for the lap

        lap_conditions.append(WeatherLap(
            lap_number=ln,
            track_temp=round(avg_track, 1),
            air_temp=round(avg_air, 1),
            rainfall=round(avg_rain, 2),
            condition=_condition(avg_rain),
        ))

    if not lap_conditions:
        return None

    # ── Global stats ──────────────────────────────────────────────────────────
    dry_laps  = sum(1 for l in lap_conditions if l.condition == "DRY")
    damp_laps = sum(1 for l in lap_conditions if l.condition == "DAMP")
    wet_laps  = sum(1 for l in lap_conditions if l.condition == "WET")

    all_track_temps = [l.track_temp for l in lap_conditions]
    avg_track_temp  = round(statistics.mean(all_track_temps), 1)
    min_track_temp  = round(min(all_track_temps), 1)
    max_track_temp  = round(max(all_track_temps), 1)

    peak_rain_lap: int | None = None
    peak_rain_val = 0.0
    for lc in lap_conditions:
        if lc.rainfall > peak_rain_val:
            peak_rain_val = lc.rainfall
            peak_rain_lap = lc.lap_number

    # ── Detect transitions ────────────────────────────────────────────────────
    events: list[WeatherEvent] = []
    prev_condition = lap_conditions[0].condition if lap_conditions else "DRY"

    for i, lc in enumerate(lap_conditions):
        curr = lc.condition

        # Rain onset
        if prev_condition == "DRY" and curr in ("DAMP", "WET"):
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
        elif prev_condition in ("DAMP", "WET") and curr == "DRY":
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

    # Peak rainfall event
    if peak_rain_lap and peak_rain_val > 0:
        events.append(WeatherEvent(
            lap_number=peak_rain_lap,
            event_type="PEAK_RAIN",
            track_temp=next((l.track_temp for l in lap_conditions if l.lap_number == peak_rain_lap), 0.0),
            air_temp=next((l.air_temp  for l in lap_conditions if l.lap_number == peak_rain_lap), 0.0),
            rainfall=peak_rain_val,
            message=(
                f"Lap {peak_rain_lap} — Peak rainfall of session. "
                f"Aquaplaning risk. Strategy-defining moment."
            ),
        ))

    events.sort(key=lambda e: e.lap_number or 0)

    # ── Strategy impact ───────────────────────────────────────────────────────
    if wet_laps >= total_laps * 0.4 or len([e for e in events if e.event_type in ("RAIN_ONSET", "RAIN_END")]) >= 3:
        strategy_impact = "High"
    elif wet_laps + damp_laps > 0 or len(events) > 0:
        strategy_impact = "Medium" if wet_laps + damp_laps >= 5 else "Low"
    else:
        strategy_impact = "None"

    # ── Summary ───────────────────────────────────────────────────────────────
    if wet_laps == 0 and damp_laps == 0:
        summary = (
            f"Dry race. Track temperature ranged {min_track_temp}–{max_track_temp}°C. "
            f"No weather strategy impact."
        )
    elif wet_laps + damp_laps >= total_laps * 0.6:
        summary = (
            f"Predominantly wet race. {wet_laps} wet + {damp_laps} damp laps. "
            f"Track {min_track_temp}–{max_track_temp}°C. "
            f"{len([e for e in events if e.event_type == 'RAIN_ONSET'])} rain onset(s)."
        )
    else:
        summary = (
            f"Mixed conditions: {dry_laps} dry, {damp_laps} damp, {wet_laps} wet laps. "
            f"Track {min_track_temp}–{max_track_temp}°C. "
            f"Strategy significantly influenced by weather."
        )

    return WeatherAnalysis(
        dry_laps=dry_laps,
        damp_laps=damp_laps,
        wet_laps=wet_laps,
        avg_track_temp=avg_track_temp,
        min_track_temp=min_track_temp,
        max_track_temp=max_track_temp,
        peak_rainfall_lap=peak_rain_lap,
        events=events,
        lap_conditions=lap_conditions,
        strategy_impact=strategy_impact,  # type: ignore[arg-type]
        summary=summary,
    )
