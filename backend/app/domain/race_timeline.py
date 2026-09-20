"""
Canonical per-lap signal map for a race session.

Built once in compute_full_analysis(), passed to every service.
No service should resolve timestamps independently — use this object.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class LapSignals:
    lap_number: int
    # ── Weather ────────────────────────────────────────────────────────────────
    condition: str = "DRY"          # "DRY" | "WET" (see services/weather_conditions)
    rainfall: bool = False          # condition == "WET"
    track_temp: Optional[float] = None
    air_temp: Optional[float] = None
    # ── Race control ───────────────────────────────────────────────────────────
    sc_active: bool = False         # also True on red-flag laps (the field is neutralised)
    vsc_active: bool = False
    red_flag: bool = False          # a red flag was shown on this lap (the restart lap is sc_active)
    yellow_active: bool = False
    race_control_messages: list[str] = field(default_factory=list)
    # ── Pace ───────────────────────────────────────────────────────────────────
    has_clean_laps: bool = False
    fastest_clean_lap: Optional[float] = None
    # ── DRS / gaps ─────────────────────────────────────────────────────────────
    min_gap_at_lap: Optional[float] = None
    train_active: bool = False      # set by drs_service after aggregation
    # ── Position ───────────────────────────────────────────────────────────────
    leader: Optional[int] = None    # driver_number of race leader at this lap
    # ── Pit activity ───────────────────────────────────────────────────────────
    pits_this_lap: list[int] = field(default_factory=list)


@dataclass
class RaceTimeline:
    session_key: int
    total_laps: int
    laps: dict[int, LapSignals] = field(default_factory=dict)

    def get(self, lap: int) -> Optional[LapSignals]:
        return self.laps.get(lap)

    def range(self, lap_start: int, lap_end: int) -> list[LapSignals]:
        return [self.laps[n] for n in range(lap_start, lap_end + 1) if n in self.laps]

    def neutralized_laps(self) -> set[int]:
        """Lap numbers where SC or VSC was active — exclude from pace comparisons."""
        return {n for n, s in self.laps.items() if s.sc_active or s.vsc_active}

    def wet_laps(self) -> set[int]:
        """Lap numbers with WET conditions."""
        return {n for n, s in self.laps.items() if s.condition == "WET"}

    def pit_laps(self, driver_number: int) -> set[int]:
        """Lap numbers where the given driver pitted."""
        return {n for n, s in self.laps.items() if driver_number in s.pits_this_lap}
