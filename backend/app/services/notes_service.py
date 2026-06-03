"""Engineer Notes — deterministic template-based generation. No LLM."""
from __future__ import annotations

from app.domain.models import EngineerNote, TyreDegradationRow, PitImpactRow, ChaosIndex


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
    Emit notes for outlier pit stops only.
    Uses race-baseline lane time (lowest quartile of stops with valid stop_duration).
    Red-flag holds (stop_duration==0, lane_duration>>normal) are excluded.
    """
    # Valid stops: must have stop_duration > 0 (means car was actually stationary)
    valid = [
        p for p in pit_impact
        if p.lane_duration and p.stop_duration and p.stop_duration > 0.5
    ]
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
    for row in sorted(pit_impact, key=lambda r: r.lane_duration or 9999):
        if not row.lane_duration or not row.stop_duration:
            continue
        if row.stop_duration <= 0.5:
            continue  # red flag hold, not a real stop

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
    """Emit one note per dry→wet transition (not per wet record)."""
    notes: list[EngineerNote] = []
    was_wet = False
    # Only laps that have a non-None date_start
    laps_sorted = sorted(
        [l for l in laps_data if l.get("date_start") is not None],
        key=lambda l: l.get("date_start") or "",
    )

    for w in sorted(weather, key=lambda x: x.get("date") or ""):
        is_wet = (w.get("rainfall") or 0) > 0
        if is_wet and not was_wet:
            w_date = w.get("date") or ""
            nearest_lap: int | None = None
            for lap in laps_sorted:
                lap_ts = lap.get("date_start") or ""
                if lap_ts <= w_date:
                    nearest_lap = lap.get("lap_number")
            # Skip notes with no resolvable lap number
            if nearest_lap is None:
                was_wet = is_wet
                continue
            notes.append(
                EngineerNote(
                    lap_number=nearest_lap,
                    type="WEATHER",
                    severity="High",
                    title="Rainfall — strategy window opens",
                    message=(
                        f"Lap {nearest_lap} — Rainfall detected. "
                        f"Track temp {w.get('track_temperature', '?')}°C. "
                        "Intermediate/wet tyre transition window opens."
                    ),
                )
            )
        was_wet = is_wet
    return notes


# ─── Undercut detection ───────────────────────────────────────────────────────

def _undercut_notes(pit_impact: list[PitImpactRow]) -> list[EngineerNote]:
    """
    Detect the most significant undercut attempts: one driver pits 1-2 laps
    before a rival and gains position through the pit cycle.
    Only emit notes for cases where the attacker gained ≥1 net position.
    Cap at 5 most significant undercuts.
    """
    notes: list[EngineerNote] = []
    by_lap: dict[int, list[PitImpactRow]] = {}
    for row in pit_impact:
        by_lap.setdefault(row.lap_number, []).append(row)

    laps_sorted = sorted(by_lap.keys())
    candidates: list[tuple[int, EngineerNote]] = []  # (gain, note)

    for i, lap in enumerate(laps_sorted):
        for j in range(i + 1, len(laps_sorted)):
            next_lap = laps_sorted[j]
            if next_lap - lap > 2:
                break
            for attacker in by_lap[lap]:
                for target in by_lap[next_lap]:
                    if attacker.driver_number == target.driver_number:
                        continue
                    # Only note if attacker gained at least 1 position
                    gain = attacker.net_position_change or 0
                    if gain < 1:
                        continue
                    gap_laps = next_lap - lap
                    msg = (
                        f"Lap {lap} — {attacker.driver_code} pits "
                        f"{gap_laps} lap(s) before {target.driver_code} (L{next_lap}). "
                        f"{attacker.driver_code} gained +{gain} position(s) through pit cycle."
                    )
                    candidates.append(
                        (
                            gain,
                            EngineerNote(
                                lap_number=lap,
                                type="UNDERCUT",
                                severity="High" if gain >= 2 else "Medium",
                                title=f"{attacker.driver_code} undercut on {target.driver_code}",
                                message=msg,
                            ),
                        )
                    )

    # Return the 5 most impactful undercuts
    candidates.sort(key=lambda x: -x[0])
    return [n for _, n in candidates[:5]]


# ─── Main entry point ─────────────────────────────────────────────────────────

def generate_engineer_notes(
    degradation: list[TyreDegradationRow],
    pit_impact: list[PitImpactRow],
    chaos: ChaosIndex,
    race_control: list[dict],
    weather: list[dict],
    laps: list[dict],
) -> list[EngineerNote]:
    notes: list[EngineerNote] = []
    notes.extend(_chaos_notes(race_control))
    notes.extend(_weather_notes(weather, laps))
    notes.extend(_pit_notes(pit_impact))
    notes.extend(_tyre_notes(degradation))
    notes.extend(_undercut_notes(pit_impact))

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
