"""Chaos Index — exact formula from CLAUDE.md spec."""
from __future__ import annotations

from collections import defaultdict

from app.domain.models import ChaosIndex, ChaosComponents


def _count_keywords(messages: list[dict], keywords: list[str]) -> int:
    count = 0
    for m in messages:
        txt = (m.get("message") or "").upper()
        if any(kw in txt for kw in keywords):
            count += 1
    return count


def _count_rain_periods(weather: list[dict]) -> int:
    """Count distinct transitions from dry to wet (not total wet records)."""
    periods = 0
    was_wet = False
    for w in sorted(weather, key=lambda x: x.get("date") or ""):
        is_wet = (w.get("rainfall") or 0) > 0
        if is_wet and not was_wet:
            periods += 1
        was_wet = is_wet
    return periods


def _position_volatility(position_data: list[dict]) -> int:
    """Count total position changes across all drivers."""
    last: dict[int, int] = {}
    changes = 0
    for rec in sorted(position_data, key=lambda p: p.get("date") or ""):
        dn = rec.get("driver_number")
        pos = rec.get("position")
        if dn and pos:
            if dn in last and last[dn] != pos:
                changes += 1
            last[dn] = pos
    return changes


def _peak_chaos_lap(race_control: list[dict]) -> int | None:
    """
    Lap with the highest concentration of impactful race-control events.
    Exclude lap 1 (pre-race messages inflate it) and laps with only minor events.
    """
    lap_events: dict[int, int] = defaultdict(int)
    for m in race_control:
        ln = m.get("lap_number")
        if not ln or ln <= 1:
            continue
        txt = (m.get("message") or "").upper()
        if any(
            kw in txt
            for kw in ("SAFETY", "YELLOW", "INVESTIGATION", "PENALTY", "VIRTUAL")
        ):
            lap_events[ln] += 1
    if not lap_events:
        return None
    return max(lap_events, key=lap_events.__getitem__)


def _level(score: int) -> str:
    if score >= 80:
        return "Extreme"
    if score >= 50:
        return "High"
    if score >= 25:
        return "Medium"
    return "Low"


def compute_chaos_index(
    race_control: list[dict],
    weather: list[dict],
    position_data: list[dict],
) -> ChaosIndex:
    sc_count = _count_keywords(
        race_control, ["SAFETY CAR DEPLOYED", "VIRTUAL SAFETY CAR DEPLOYED"]
    )
    yellow_count = _count_keywords(race_control, ["YELLOW"])
    invest_count = _count_keywords(
        race_control, ["INVESTIGATION", "UNDER INVESTIGATION"]
    )
    penalty_cnt = _count_keywords(
        race_control, ["TIME PENALTY", "DRIVE THROUGH", "STOP AND GO"]
    )
    rain_periods = _count_rain_periods(weather)
    pos_vol = _position_volatility(position_data)

    sc_pts    = min(sc_count * 15, 30)
    yellow_pts = min(yellow_count * 3, 20)
    invest_pts = min(invest_count * 5, 20)
    penalty_pts = min(penalty_cnt * 4, 15)
    weather_pts = min(rain_periods * 10, 15)
    vol_pts    = min(pos_vol // 5, 20)

    score = min(
        sc_pts + yellow_pts + invest_pts + penalty_pts + weather_pts + vol_pts, 100
    )
    level = _level(score)
    peak = _peak_chaos_lap(race_control)

    # Human-readable summary
    parts: list[str] = []
    if sc_count:
        parts.append(f"{sc_count} SC/VSC deployment{'s' if sc_count > 1 else ''}")
    if yellow_count:
        parts.append(f"{yellow_count} yellow flag event{'s' if yellow_count > 1 else ''}")
    if invest_count:
        parts.append(f"{invest_count} investigation{'s' if invest_count > 1 else ''}")
    if rain_periods:
        parts.append(f"{rain_periods} rain period{'s' if rain_periods > 1 else ''}")
    if pos_vol:
        parts.append(f"{pos_vol} position changes recorded")

    summary = f"{level} race. " + (", ".join(parts) + "." if parts else "Quiet race.")

    return ChaosIndex(
        score=score,
        level=level,  # type: ignore[arg-type]
        peak_chaos_lap=peak,
        components=ChaosComponents(
            safety_car=sc_pts,
            yellow_flags=yellow_pts,
            investigations=invest_pts,
            penalties=penalty_pts,
            weather=weather_pts,
            position_volatility=vol_pts,
        ),
        summary=summary,
    )
