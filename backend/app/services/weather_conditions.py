"""
Single source of truth for "is the track wet?".

OpenF1's ``rainfall`` field is a 0/1 sensor flag sampled roughly once a minute,
not a rainfall amount. Every service that needs to know about rain (chaos,
engineer notes, timeline, weather analysis, crossovers) goes through this
module so that all of them agree on what counts as a rain period and which
laps were wet.

Rules:
- Records before the first lap's ``date_start`` are ignored (pre-race
  showers don't affect the race).
- A rain period needs at least ``MIN_WET_RECORDS`` consecutive wet records.
  A single flagged minute is a sensor blip, not a strategy window.
- Dry gaps of up to ``MAX_DRY_GAP_RECORDS`` records between wet records are
  filled, so a flickering flag inside one shower is one period, not several.
- There are only two conditions, DRY and WET. A flag cannot express "damp".
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

# Records are ~1/minute, so these are approximately minutes.
MIN_WET_RECORDS = 3        # shortest run of wet records that counts as a rain period
MAX_DRY_GAP_RECORDS = 2    # longest dry gap that is still the same rain period

DRY = "DRY"
WET = "WET"


@dataclass(frozen=True)
class RainPeriod:
    start: datetime          # first wet record
    end: datetime            # last wet record
    record_count: int        # wet records after gap filling
    first_record: dict       # raw weather record at ``start`` (for track temp, etc.)


def parse_ts(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def is_wet_record(record: dict) -> bool:
    """The only place that reads ``rainfall``."""
    return bool(record.get("rainfall") or 0)


def race_start(laps: list[dict]) -> datetime | None:
    """Earliest ``date_start`` across all lap records, or None if unknown."""
    starts = [parse_ts(l.get("date_start")) for l in laps]
    starts = [s for s in starts if s is not None]
    return min(starts) if starts else None


def _timed_records(weather: list[dict], start: datetime | None) -> list[tuple[datetime, dict]]:
    timed = []
    for w in weather:
        t = parse_ts(w.get("date"))
        if t is None:
            continue
        if start is not None and t < start:
            continue
        timed.append((t, w))
    timed.sort(key=lambda x: x[0])
    return timed


def _fill_short_gaps(flags: list[bool]) -> list[bool]:
    """Turn dry gaps of <= MAX_DRY_GAP_RECORDS between wet records into wet."""
    filled = list(flags)
    i = 0
    n = len(filled)
    while i < n:
        if filled[i]:
            i += 1
            continue
        j = i
        while j < n and not filled[j]:
            j += 1
        # dry run is flags[i:j]; bounded by wet on both sides?
        if 0 < i and j < n and (j - i) <= MAX_DRY_GAP_RECORDS:
            for k in range(i, j):
                filled[k] = True
        i = j
    return filled


def detect_rain_periods(weather: list[dict], laps: list[dict]) -> list[RainPeriod]:
    """
    Rain periods during the race, in chronological order.
    ``laps`` is used only to find the race start; pass ``[]`` to keep every record.
    """
    timed = _timed_records(weather, race_start(laps))
    if not timed:
        return []

    flags = _fill_short_gaps([is_wet_record(w) for _, w in timed])

    periods: list[RainPeriod] = []
    i = 0
    n = len(flags)
    while i < n:
        if not flags[i]:
            i += 1
            continue
        j = i
        while j < n and flags[j]:
            j += 1
        if (j - i) >= MIN_WET_RECORDS:
            periods.append(RainPeriod(
                start=timed[i][0],
                end=timed[j - 1][0],
                record_count=j - i,
                first_record=timed[i][1],
            ))
        i = j
    return periods


def count_rain_periods(weather: list[dict], laps: list[dict]) -> int:
    return len(detect_rain_periods(weather, laps))


# ── Per-lap condition ─────────────────────────────────────────────────────────

def lap_time_index(laps: list[dict]) -> list[tuple[int, datetime]]:
    """Sorted [(lap_number, median date_start across drivers)]."""
    by_lap: dict[int, list[datetime]] = {}
    for lap in laps:
        ln = lap.get("lap_number")
        ds = parse_ts(lap.get("date_start"))
        if ln and ds:
            by_lap.setdefault(ln, []).append(ds)
    index = []
    for ln, times in by_lap.items():
        s = sorted(times)
        index.append((ln, s[len(s) // 2]))
    return sorted(index, key=lambda x: x[0])


def lap_for_time(t: datetime, index: list[tuple[int, datetime]]) -> int | None:
    """Lap whose [start, next start) window contains ``t``; last lap is open-ended."""
    for i, (ln, lt) in enumerate(index):
        if i + 1 < len(index):
            if lt <= t < index[i + 1][1]:
                return ln
        elif t >= lt:
            return ln
    return None


def lap_for_period_start(period: RainPeriod, index: list[tuple[int, datetime]]) -> int | None:
    """Lap on which a rain period began (last lap that started at or before it)."""
    lap: int | None = None
    for ln, lt in index:
        if lt <= period.start:
            lap = ln
    return lap


def wet_lap_numbers(periods: list[RainPeriod], index: list[tuple[int, datetime]]) -> set[int]:
    """Laps whose time window overlaps any rain period."""
    wet: set[int] = set()
    if not index or not periods:
        return wet
    for i, (ln, lt) in enumerate(index):
        next_lt = index[i + 1][1] if i + 1 < len(index) else None
        for p in periods:
            starts_before_window_ends = next_lt is None or p.start < next_lt
            ends_after_window_starts = p.end >= lt
            if starts_before_window_ends and ends_after_window_starts:
                wet.add(ln)
                break
    return wet


def lap_conditions(weather: list[dict], laps: list[dict]) -> dict[int, str]:
    """``{lap_number: "DRY" | "WET"}`` for every lap in ``laps``."""
    index = lap_time_index(laps)
    wet = wet_lap_numbers(detect_rain_periods(weather, laps), index)
    return {ln: (WET if ln in wet else DRY) for ln, _ in index}
