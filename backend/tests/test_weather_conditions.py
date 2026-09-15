"""Unit tests for the rain-period detector on synthetic weather series."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.services.weather_conditions import (
    MAX_DRY_GAP_RECORDS,
    MIN_WET_RECORDS,
    count_rain_periods,
    detect_rain_periods,
    lap_conditions,
)

T0 = datetime(2024, 6, 23, 13, 0, tzinfo=timezone.utc)


def series(flags: str, start: datetime = T0) -> list[dict]:
    """'..###.' -> one weather record per char, one minute apart, # = rainfall 1."""
    return [
        {"date": (start + timedelta(minutes=i)).isoformat(), "rainfall": 1 if c == "#" else 0}
        for i, c in enumerate(flags)
    ]


def laps_from(start: datetime, n: int, minutes_per_lap: float = 1.5) -> list[dict]:
    return [
        {"lap_number": i + 1, "date_start": (start + timedelta(minutes=i * minutes_per_lap)).isoformat()}
        for i in range(n)
    ]


def test_constants_are_what_the_rules_assume():
    assert MIN_WET_RECORDS == 3
    assert MAX_DRY_GAP_RECORDS == 2


def test_single_record_blip_is_not_a_period():
    assert count_rain_periods(series("....#...."), []) == 0


def test_two_consecutive_records_are_still_a_blip():
    assert count_rain_periods(series("...##...."), []) == 0


def test_three_consecutive_records_are_a_period():
    periods = detect_rain_periods(series("...###..."), [])
    assert len(periods) == 1
    assert periods[0].record_count == 3


def test_dry_gap_of_two_inside_a_shower_does_not_split_it():
    periods = detect_rain_periods(series("..###..###.."), [])
    assert len(periods) == 1
    assert periods[0].record_count == 8  # gap filled


def test_dry_gap_of_three_splits_the_shower():
    assert count_rain_periods(series("..###...###.."), []) == 2


def test_gap_filling_does_not_rescue_blips_separated_by_long_dry_runs():
    assert count_rain_periods(series("#.....#.....#"), []) == 0


def test_two_blips_bridged_by_a_short_gap_count_once_they_reach_min_length():
    # '#.#' becomes '###' after gap filling -> exactly MIN_WET_RECORDS
    assert count_rain_periods(series("...#.#..."), []) == 1


def test_leading_and_trailing_dry_records_are_not_filled():
    # a gap is only filled when wet records bound it on both sides
    assert count_rain_periods(series(".##"), []) == 0
    assert count_rain_periods(series("##."), []) == 0


def test_rain_before_first_lap_is_ignored():
    wx = series("#####.........")          # 5 wet minutes, all before the race
    laps = laps_from(T0 + timedelta(minutes=6), 5)
    assert count_rain_periods(wx, laps) == 0


def test_rain_spanning_the_race_start_counts_only_the_in_race_part():
    wx = series("####......")               # wet 13:00-13:03, race starts 13:02
    laps = laps_from(T0 + timedelta(minutes=2), 5)
    periods = detect_rain_periods(wx, laps)
    assert len(periods) == 0                # only 2 in-race wet records remain

    wx = series("######....")               # wet 13:00-13:05 -> 4 in-race records
    periods = detect_rain_periods(wx, laps)
    assert len(periods) == 1
    assert periods[0].start == T0 + timedelta(minutes=2)


def test_lap_conditions_only_dry_or_wet_and_cover_the_period():
    wx = series("....###....")
    laps = laps_from(T0, 8, minutes_per_lap=1.0)
    conds = lap_conditions(wx, laps)
    assert set(conds.values()) <= {"DRY", "WET"}
    assert [ln for ln, c in sorted(conds.items()) if c == "WET"] == [5, 6, 7]


def test_lap_conditions_are_all_dry_for_a_blip():
    wx = series("....#......")
    laps = laps_from(T0, 8, minutes_per_lap=1.0)
    assert set(lap_conditions(wx, laps).values()) == {"DRY"}
