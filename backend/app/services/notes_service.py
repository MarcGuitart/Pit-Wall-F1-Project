"""Engineer Notes — deterministic template-based generation. No LLM."""
from __future__ import annotations

from app.domain.models import (
    ChaosIndex, EngineerNote, PitCycle, PitImpactRow, TyreDegradationRow, Undercut,
)
from app.services.weather_conditions import (
    detect_rain_periods, lap_for_period_start, lap_time_index,
)


# ─── Tyre degradation notes ───────────────────────────────────────────────────

def _tyre_notes(degradation: list[TyreDegradationRow]) -> list[EngineerNote]:
    """
    Emit tyre notes for the most concerning stints only.
    - High cliff: top 3 worst slopes above 0.08 s/lap
    - Medium: only if slope >= 0.06 AND confidence >= Medium
    Cap at 6 total tyre notes.
    """
    notes: list[EngineerNote] = []

    high_cliff = sorted(
        [r for r in degradation if r.cliff_risk == "High" and r.degradation_slope >= 0.08],
        key=lambda r: -r.degradation_slope,
    )[:3]

    for row in high_cliff:
        notes.append(
            EngineerNote(
                lap_number=row.lap_end,
                type="TYRE_DEGRADATION",
                severity="High",
                title=f"{row.driver_code} {row.compound} cliff risk",
                message=(
                    f"Lap {row.lap_end} — {row.driver_code} {row.compound} "
                    f"degradation slope reached +{row.degradation_slope:.3f} s/lap. "
                    f"High cliff risk. Stint {row.stint_number}, "
                    f"L{row.lap_start}–{row.lap_end}. Confidence: {row.confidence}."
                ),
            )
        )

    medium_notable = sorted(
        [
            r for r in degradation
            if r.cliff_risk == "Medium"
            and r.degradation_slope >= 0.06
            and r.confidence in ("Medium", "High")
        ],
        key=lambda r: -r.degradation_slope,
    )[:3]

    for row in medium_notable:
        notes.append(
            EngineerNote(
                lap_number=row.lap_end,
                type="TYRE_DEGRADATION",
                severity="Medium",
                title=f"{row.driver_code} {row.compound} degrading",
                message=(
                    f"Lap {row.lap_end} — {row.driver_code} {row.compound} "
                    f"slope +{row.degradation_slope:.3f} s/lap. Medium cliff risk."
                ),
            )
        )

    return notes[:6]


# ─── Pit impact notes ─────────────────────────────────────────────────────────

def _pit_notes(pit_impact: list[PitImpactRow]) -> list[EngineerNote]:
    """
    Emit notes for outlier pit stops only, judged on lane_duration against the
    race baseline (median lane time of racing stops). Stops under SC/VSC or a
    red flag are not judged — their lane time is not a pit-crew performance.
    """
    valid = [p for p in pit_impact if p.lane_duration and p.stop_type == "racing"]
    if not valid:
        return []

    lanes = sorted(p.lane_duration for p in valid)  # type: ignore[arg-type]
    # Baseline = median of valid stops
    n = len(lanes)
    baseline = lanes[n // 2]
    slow_threshold = baseline + 4.0
    fast_threshold = baseline - 2.5

    notes: list[EngineerNote] = []
    slow_count = 0
    for row in sorted(valid, key=lambda r: r.lane_duration or 9999):

        net_str = (
            f"{row.net_position_change:+d}" if row.net_position_change is not None else "–"
        )

        if row.lane_duration > slow_threshold and slow_count < 5:
            notes.append(
                EngineerNote(
                    lap_number=row.lap_number,
                    type="PIT_IMPACT",
                    severity="High",
                    title=f"{row.driver_code} slow stop L{row.lap_number}",
                    message=(
                        f"Lap {row.lap_number} — {row.driver_code}: "
                        f"lane {row.lane_duration:.1f}s "
                        f"(+{row.lane_duration - baseline:.1f}s vs race baseline {baseline:.1f}s). "
                        f"Net position change: {net_str}."
                    ),
                )
            )
            slow_count += 1
        elif row.lane_duration < fast_threshold:
            notes.append(
                EngineerNote(
                    lap_number=row.lap_number,
                    type="PIT_IMPACT",
                    severity="Low",
                    title=f"{row.driver_code} fast stop L{row.lap_number}",
                    message=(
                        f"Lap {row.lap_number} — {row.driver_code}: "
                        f"excellent lane time {row.lane_duration:.1f}s "
                        f"({baseline - row.lane_duration:.1f}s under baseline)."
                    ),
                )
            )
    return notes[:10]


# ─── SC/VSC chaos notes ───────────────────────────────────────────────────────

def _chaos_notes(race_control: list[dict]) -> list[EngineerNote]:
    notes: list[EngineerNote] = []
    seen = 0
    for msg in sorted(race_control, key=lambda m: m.get("date") or ""):
        txt = (msg.get("message") or "").upper()
        ln = msg.get("lap_number")
        is_deploy = (
            "SAFETY CAR DEPLOYED" in txt or "VIRTUAL SAFETY CAR DEPLOYED" in txt
        )
        if is_deploy and seen < 4:
            kind = "VSC" if "VIRTUAL" in txt else "SC"
            notes.append(
                EngineerNote(
                    lap_number=ln,
                    type="CHAOS",
                    severity="High",
                    title=f"{kind} deployed — Lap {ln}",
                    message=(
                        f"Lap {ln} — {kind} deployed. "
                        f"Race control: '{(msg.get('message') or '')[:80]}'"
                    ),
                )
            )
            seen += 1
    return notes


# ─── Weather notes ────────────────────────────────────────────────────────────

def _weather_notes(weather: list[dict], laps_data: list[dict]) -> list[EngineerNote]:
    """One note per rain period (as defined by weather_conditions), at the lap it started."""
    notes: list[EngineerNote] = []
    index = lap_time_index(laps_data)
    for period in detect_rain_periods(weather, laps_data):
        lap = lap_for_period_start(period, index)
        if lap is None:
            continue
        notes.append(
            EngineerNote(
                lap_number=lap,
                type="WEATHER",
                severity="High",
                title="Rainfall — strategy window opens",
                message=(
                    f"Lap {lap} — Rainfall detected. "
                    f"Track temp {period.first_record.get('track_temperature', '?')}°C. "
                    "Intermediate/wet tyre transition window opens."
                ),
            )
        )
    return notes


# ─── Undercut detection ───────────────────────────────────────────────────────

def _undercut_notes(pit_cycles: list[PitCycle]) -> list[EngineerNote]:
    """
    One note per attacker per pit cycle, listing every rival the undercut
    beat (pit_cycle_service decides what an undercut is). Five 'X undercut on
    Y' notes for one stop are one event, not five.
    Cap at 5 notes, most rivals beaten first.
    """
    candidates: list[tuple[tuple[int, int], EngineerNote]] = []
    for cycle in pit_cycles:
        by_attacker: dict[str, list[Undercut]] = {}
        for u in cycle.undercuts:
            by_attacker.setdefault(u.attacker, []).append(u)
        deltas = {p.driver_code: p.delta for p in cycle.participants}
        for attacker, hits in by_attacker.items():
            targets = sorted({u.target for u in hits})
            a_lap = min(u.attacker_lap for u in hits)
            t_laps = sorted({u.target_lap for u in hits})
            gain = deltas.get(attacker, 0)
            caveat = " SC/VSC inside the cycle — timing attribution unreliable." if cycle.neutralised else ""
            candidates.append((
                (len(targets), gain),
                EngineerNote(
                    lap_number=a_lap,
                    type="UNDERCUT",
                    severity="High" if len(targets) >= 2 or gain >= 2 else "Medium",
                    title=f"{attacker} undercut {', '.join(targets)}",
                    message=(
                        f"Lap {a_lap} — {attacker} pitted before {', '.join(targets)} "
                        f"(L{'/'.join(str(l) for l in t_laps)}) and came out ahead. "
                        f"Net {gain:+d} through the pit cycle (L{cycle.lap_start}–{cycle.close_lap})."
                        f"{caveat}"
                    ),
                ),
            ))
    candidates.sort(key=lambda x: (-x[0][0], -x[0][1]))
    return [n for _, n in candidates[:5]]


# ─── Main entry point ─────────────────────────────────────────────────────────

def generate_engineer_notes(
    degradation: list[TyreDegradationRow],
    pit_impact: list[PitImpactRow],
    chaos: ChaosIndex,
    race_control: list[dict],
    weather: list[dict],
    laps: list[dict],
    pit_cycles: list[PitCycle] | None = None,
) -> list[EngineerNote]:
    notes: list[EngineerNote] = []
    notes.extend(_chaos_notes(race_control))
    notes.extend(_weather_notes(weather, laps))
    notes.extend(_pit_notes(pit_impact))
    notes.extend(_tyre_notes(degradation))
    notes.extend(_undercut_notes(pit_cycles or []))

    # De-duplicate by (type, lap_number, title)
    seen: set[tuple] = set()
    unique: list[EngineerNote] = []
    for n in notes:
        key = (n.type, n.lap_number, n.title[:30])
        if key not in seen:
            seen.add(key)
            unique.append(n)

    # Sort: High severity first, then by lap number
    unique.sort(key=lambda n: (
        0 if n.severity == "High" else 1 if n.severity == "Medium" else 2,
        n.lap_number or 0,
    ))

    # Cap total at 20 notes — more than enough for the UI
    return unique[:20]
