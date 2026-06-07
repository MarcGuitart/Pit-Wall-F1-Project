"""
Clean Air Value Estimator (V4-04).

Compares in-train lap times vs post-train lap times to estimate how much
clean air is worth per lap.

RULES:
- Minimum 3 clean in-train laps per driver (else skip)
- Minimum 2 post-train clean laps per driver (else skip)
- Confidence is NEVER "High" — max "Medium" (data is inherently noisy)
- If estimated gain < 0: discard (faster in traffic than in clean air = bad data)
"""
from __future__ import annotations

import statistics
from typing import Optional

from app.domain.models import (
    CleanAirValue, DriverCleanAirEstimate, MeaningfulDRSTrain, TruePaceRow,
)
from app.domain.race_timeline import RaceTimeline


MIN_IN_TRAIN_LAPS  = 3
MIN_POST_TRAIN_LAPS = 2
POST_TRAIN_WINDOW   = 6   # laps after train ends to sample


def _get_driver_number(
    driver_code: str, pace_rows: list[TruePaceRow]
) -> int | None:
    for row in pace_rows:
        if row.driver_code == driver_code:
            return row.driver_number
    return None


def _generate_implication(avg_gain: float) -> str:
    if avg_gain >= 0.5:
        return (
            f"Drivers in traffic lost approximately {avg_gain:.2f}s/lap vs clean air — "
            f"track position was extremely valuable in this session."
        )
    if avg_gain >= 0.25:
        return (
            f"Estimated {avg_gain:.2f}s/lap benefit for running in clean air — "
            f"undercut attempts carry significant timing advantage."
        )
    return (
        f"Modest clean-air advantage (~{avg_gain:.2f}s/lap) — "
        f"other factors (tyre age, pit timing) likely dominated strategy."
    )


def estimate_clean_air_value(
    meaningful_trains: list[MeaningfulDRSTrain],
    pace_rows: list[TruePaceRow],
    laps_data: list[dict],
    timeline: RaceTimeline,
) -> Optional[CleanAirValue]:
    """
    Compare median lap time while trapped in a DRS train vs. post-train.
    Returns None if no trains or insufficient data.
    """
    if not meaningful_trains or not pace_rows or not laps_data:
        return CleanAirValue(
            estimated_gain=None,
            confidence="Low",
            drivers=[],
            strategic_implication="Insufficient data — no meaningful DRS trains detected.",
        )

    neutralized = timeline.neutralized_laps()
    estimates: list[DriverCleanAirEstimate] = []

    for train in meaningful_trains:
        for driver_code in train.trapped_drivers[:3]:
            driver_num = _get_driver_number(driver_code, pace_rows)
            if driver_num is None:
                continue

            # In-train laps: clean, not neutralized, not pit-out
            in_train_laps = [
                lap["lap_duration"]
                for lap in laps_data
                if (
                    lap.get("driver_number") == driver_num
                    and train.lap_start <= lap.get("lap_number", 0) <= train.lap_end
                    and lap.get("lap_duration")
                    and not lap.get("is_pit_out_lap", False)
                    and lap.get("lap_number") not in neutralized
                )
            ]

            # Post-train laps: first POST_TRAIN_WINDOW laps after train ends
            post_train_laps = [
                lap["lap_duration"]
                for lap in laps_data
                if (
                    lap.get("driver_number") == driver_num
                    and train.lap_end < lap.get("lap_number", 0) <= train.lap_end + POST_TRAIN_WINDOW
                    and lap.get("lap_duration")
                    and not lap.get("is_pit_out_lap", False)
                    and lap.get("lap_number") not in neutralized
                )
            ]

            if len(in_train_laps) < MIN_IN_TRAIN_LAPS:
                continue
            if len(post_train_laps) < MIN_POST_TRAIN_LAPS:
                continue

            # Positive gain = faster in clean air (post-train faster than in-train)
            gain = statistics.median(in_train_laps) - statistics.median(post_train_laps)

            # Rule: negative gain = data unreliable, discard
            if gain < 0:
                continue

            # Confidence: Medium only if both windows have >=4 laps
            conf: str = (
                "Medium"
                if min(len(in_train_laps), len(post_train_laps)) >= 4
                else "Low"
            )

            estimates.append(DriverCleanAirEstimate(
                driver_code=driver_code,
                gain=round(gain, 3),
                context=f"after exiting DRS train (L{train.lap_start}–{train.lap_end})",
                sample_in_train=len(in_train_laps),
                sample_post_train=len(post_train_laps),
                confidence=conf,  # type: ignore[arg-type]
            ))

    if not estimates:
        return CleanAirValue(
            estimated_gain=None,
            confidence="Low",
            drivers=[],
            strategic_implication=(
                "Insufficient clean-air comparison data for this session."
            ),
        )

    # Prefer Medium-confidence estimates; fall back to all if none
    valid = [e for e in estimates if e.confidence == "Medium"] or estimates
    avg_gain = statistics.median([e.gain for e in valid])

    # Confidence cap: NEVER "High". Maximum is "Medium".
    overall_conf: str = (
        "Medium" if any(e.confidence == "Medium" for e in valid) else "Low"
    )

    return CleanAirValue(
        estimated_gain=round(avg_gain, 3),
        confidence=overall_conf,  # type: ignore[arg-type]
        drivers=sorted(valid, key=lambda e: -e.gain)[:3],
        strategic_implication=_generate_implication(avg_gain),
    )
