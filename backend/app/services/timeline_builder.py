"""
Builds the canonical RaceTimeline — called once per analysis, passed to all services.
Replaces ad-hoc timestamp resolution that was duplicated across weather/drs services.
"""
from __future__ import annotations

import statistics
from collections import defaultdict
from datetime import datetime

from app.domain.race_timeline import LapSignals, RaceTimeline


def _parse_ts(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _build_lap_time_index(laps_data: list[dict]) -> list[tuple[int, datetime]]:
    """Return sorted [(lap_number, median_start_time)] for all laps."""
    lap_times: dict[int, list[datetime]] = defaultdict(list)
    for lap in laps_data:
        ln = lap.get("lap_number")
        ds = _parse_ts(lap.get("date_start"))
        if ln and ds:
            lap_times[ln].append(ds)
    result = []
    for ln, times in lap_times.items():
        s = sorted(times)
        result.append((ln, s[len(s) // 2]))
    return sorted(result, key=lambda x: x[0])


def _lap_for_time(
    t: datetime, lap_index: list[tuple[int, datetime]]
) -> int | None:
    if not lap_index:
        return None
    for i, (ln, lt) in enumerate(lap_index):
        if i + 1 < len(lap_index):
            if lt <= t < lap_index[i + 1][1]:
                return ln
        else:
            if t >= lt:
                return ln
    return None


def _build_sc_vsc_maps(
    race_control: list[dict],
) -> tuple[set[int], set[int]]:
    """Return (sc_active_laps, vsc_active_laps) — SEPARATE sets."""
    sc_laps: set[int] = set()
    vsc_laps: set[int] = set()
    sc_deploy_lap: int | None = None
    vsc_deploy_lap: int | None = None

    for msg in sorted(race_control, key=lambda m: m.get("date") or ""):
        txt = (msg.get("message") or "").upper()
        lap = msg.get("lap_number")

        is_sc_deploy = "SAFETY CAR DEPLOYED" in txt and "VIRTUAL" not in txt
        is_vsc_deploy = "VIRTUAL SAFETY CAR DEPLOYED" in txt
        is_sc_end = "SAFETY CAR IN THIS LAP" in txt
        is_vsc_end = "VIRTUAL SAFETY CAR ENDING" in txt

        if is_sc_deploy and lap:
            # If SC already active, flush laps up to this re-deployment first
            if sc_deploy_lap is not None:
                for l in range(sc_deploy_lap, lap + 1):
                    sc_laps.add(l)
            sc_deploy_lap = lap
            sc_laps.add(lap)
        elif is_vsc_deploy and lap:
            if vsc_deploy_lap is not None:
                for l in range(vsc_deploy_lap, lap + 1):
                    vsc_laps.add(l)
            vsc_deploy_lap = lap
            vsc_laps.add(lap)
        elif is_sc_end and sc_deploy_lap and lap:
            for l in range(sc_deploy_lap, lap + 2):
                sc_laps.add(l)
            sc_deploy_lap = None
        elif is_vsc_end and vsc_deploy_lap and lap:
            for l in range(vsc_deploy_lap, lap + 2):
                vsc_laps.add(l)
            vsc_deploy_lap = None
        else:
            # Still under neutralization — mark this lap too
            if sc_deploy_lap and lap:
                sc_laps.add(lap)
            if vsc_deploy_lap and lap:
                vsc_laps.add(lap)

    return sc_laps, vsc_laps


def _weather_condition(rainfall: float) -> str:
    if rainfall >= 1.0:
        return "WET"
    if rainfall > 0:
        return "DAMP"
    return "DRY"


def build_race_timeline(
    laps_data: list[dict],
    weather_data: list[dict],
    race_control_data: list[dict],
    pit_data: list[dict],
    interval_data: list[dict],
    position_data: list[dict],
    session_key: int = 0,
) -> RaceTimeline:
    """
    Build the canonical per-lap signal map for a session.
    All V4 services call this once and read from it.
    """
    if not laps_data:
        return RaceTimeline(session_key=session_key, total_laps=0)

    # ── Infer total laps ──────────────────────────────────────────────────────
    all_lap_nums = [l.get("lap_number") for l in laps_data if l.get("lap_number")]
    total_laps = max(all_lap_nums) if all_lap_nums else 0

    # ── Lap time index (lap_number → median start time) ───────────────────────
    lap_index = _build_lap_time_index(laps_data)
    if not lap_index:
        return RaceTimeline(session_key=session_key, total_laps=total_laps)

    # Time window for each lap: from its median start to the next lap's start
    lap_start_time: dict[int, datetime] = {ln: lt for ln, lt in lap_index}
    lap_end_time: dict[int, datetime] = {}
    for i, (ln, lt) in enumerate(lap_index):
        if i + 1 < len(lap_index):
            lap_end_time[ln] = lap_index[i + 1][1]
        else:
            lap_end_time[ln] = lt  # last lap: use start as end (open window)

    # ── SC/VSC per lap ────────────────────────────────────────────────────────
    sc_laps, vsc_laps = _build_sc_vsc_maps(race_control_data)

    # ── Yellow flags per lap (from race_control lap_number field) ─────────────
    yellow_laps: set[int] = set()
    rc_messages_per_lap: dict[int, list[str]] = defaultdict(list)
    for msg in race_control_data:
        lap = msg.get("lap_number")
        txt = msg.get("message") or ""
        if lap:
            rc_messages_per_lap[lap].append(txt)
            if "YELLOW" in txt.upper():
                yellow_laps.add(lap)

    # ── Weather per lap ────────────────────────────────────────────────────────
    lap_weather_records: dict[int, list[dict]] = defaultdict(list)
    for w in weather_data:
        t = _parse_ts(w.get("date"))
        if t:
            ln = _lap_for_time(t, lap_index)
            if ln:
                lap_weather_records[ln].append(w)

    # ── Pits per lap ──────────────────────────────────────────────────────────
    pits_per_lap: dict[int, list[int]] = defaultdict(list)
    for p in pit_data:
        ln = p.get("lap_number")
        dn = p.get("driver_number")
        if ln and dn:
            pits_per_lap[ln].append(int(dn))

    # ── Intervals per lap (min gap) ───────────────────────────────────────────
    interval_per_lap: dict[int, list[float]] = defaultdict(list)
    for rec in interval_data:
        t = _parse_ts(rec.get("date"))
        iv = rec.get("interval")
        if t and isinstance(iv, (int, float)) and iv > 0:
            ln = _lap_for_time(t, lap_index)
            if ln:
                interval_per_lap[ln].append(float(iv))

    # ── Leader per lap (position=1 from position_data) ────────────────────────
    # Build sorted position records
    pos_sorted = sorted(
        [p for p in position_data if p.get("position") == 1 and p.get("date")],
        key=lambda p: p["date"],
    )

    def leader_at_lap(lap_num: int) -> int | None:
        """Find leader closest to this lap's start time."""
        if not pos_sorted or lap_num not in lap_start_time:
            return None
        target = lap_start_time[lap_num].isoformat()
        # Binary search for closest record <= target
        best = None
        for rec in pos_sorted:
            if rec["date"] <= target:
                best = rec.get("driver_number")
            else:
                break
        return best

    # ── Clean lap stats per lap ────────────────────────────────────────────────
    clean_durations_per_lap: dict[int, list[float]] = defaultdict(list)
    for lap in laps_data:
        ln = lap.get("lap_number")
        dur = lap.get("lap_duration")
        is_pit_out = lap.get("is_pit_out_lap", False)
        if ln and dur and not is_pit_out and isinstance(dur, (int, float)):
            clean_durations_per_lap[ln].append(float(dur))

    # ── Assemble LapSignals for each lap ──────────────────────────────────────
    laps_map: dict[int, LapSignals] = {}

    for lap_num in range(1, total_laps + 1):
        # Weather
        wx_records = lap_weather_records.get(lap_num, [])
        if wx_records:
            track_temps = [r.get("track_temperature") for r in wx_records if r.get("track_temperature") is not None]
            air_temps   = [r.get("air_temperature")   for r in wx_records if r.get("air_temperature")   is not None]
            rainfalls   = [r.get("rainfall") or 0 for r in wx_records]
            max_rain = max(rainfalls)
            track_temp = round(statistics.mean(track_temps), 1) if track_temps else None
            air_temp   = round(statistics.mean(air_temps), 1)   if air_temps   else None
            condition  = _weather_condition(max_rain)
            has_rain   = max_rain > 0
        else:
            track_temp = None
            air_temp   = None
            condition  = "DRY"
            has_rain   = False
            max_rain   = 0.0

        # Intervals
        lap_ivs = interval_per_lap.get(lap_num, [])
        min_gap = round(min(lap_ivs), 3) if lap_ivs else None

        # Clean laps
        clean_durs = clean_durations_per_lap.get(lap_num, [])

        laps_map[lap_num] = LapSignals(
            lap_number=lap_num,
            condition=condition,
            rainfall=has_rain,
            track_temp=track_temp,
            air_temp=air_temp,
            sc_active=lap_num in sc_laps,
            vsc_active=lap_num in vsc_laps,
            yellow_active=lap_num in yellow_laps,
            race_control_messages=rc_messages_per_lap.get(lap_num, []),
            has_clean_laps=bool(clean_durs),
            fastest_clean_lap=round(min(clean_durs), 3) if clean_durs else None,
            min_gap_at_lap=min_gap,
            train_active=False,     # set by drs_service after aggregation
            leader=leader_at_lap(lap_num),
            pits_this_lap=pits_per_lap.get(lap_num, []),
        )

    return RaceTimeline(
        session_key=session_key,
        total_laps=total_laps,
        laps=laps_map,
    )
