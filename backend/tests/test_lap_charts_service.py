"""Lap chart input — the raw shape frontend/lib/lapCharts.ts computes on."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services.lap_charts_service import build_lap_charts, neutralised_bands

CACHE = Path(__file__).resolve().parents[1] / "cache"


def rc(lap, msg, flag=None, date="2024-01-01T00:00:00"):
    return {"lap_number": lap, "message": msg, "flag": flag, "date": date}


def test_bands_open_and_close_on_race_control():
    msgs = [
        rc(10, "SAFETY CAR DEPLOYED", date="2024-01-01T00:10:00"),
        rc(13, "SAFETY CAR IN THIS LAP", date="2024-01-01T00:20:00"),
        rc(20, "VIRTUAL SAFETY CAR DEPLOYED", date="2024-01-01T00:30:00"),
        rc(21, "VIRTUAL SAFETY CAR ENDING", date="2024-01-01T00:32:00"),
        rc(50, "CHEQUERED FLAG", "CHEQUERED", date="2024-01-01T01:30:00"),
    ]
    assert neutralised_bands(msgs, 50) == [
        {"kind": "SC", "from": 10, "to": 13},
        {"kind": "VSC", "from": 20, "to": 21},
    ]


def test_an_open_band_runs_to_the_last_lap_and_chequered_is_not_red():
    msgs = [rc(48, "SAFETY CAR DEPLOYED"), rc(50, "CHEQUERED FLAG", "CHEQUERED")]
    assert neutralised_bands(msgs, 50) == [{"kind": "SC", "from": 48, "to": 50}]


def test_build_orders_by_classification_and_marks_pit_laps():
    laps = [
        {"driver_number": 1, "lap_number": n, "lap_duration": 90.0, "is_pit_out_lap": n == 6} for n in range(1, 11)
    ] + [
        {"driver_number": 44, "lap_number": n, "lap_duration": 89.0, "is_pit_out_lap": False} for n in range(1, 11)
    ]
    out = build_lap_charts(
        1, laps, [{"driver_number": 1, "stint_number": 1, "compound": "SOFT", "lap_start": 1, "lap_end": 5}],
        [{"driver_number": 1, "lap_number": 5}], [],
        [{"driver_number": 1, "name_acronym": "VER", "team_colour": "3671C6"}],
        classification=[{"driver_number": 1, "finishing_position": 1}, {"driver_number": 44, "finishing_position": 2}],
    )
    assert out["winner"] == "VER" and out["total_laps"] == 10
    ver = out["drivers"][0]
    assert ver["colour"] == "#3671C6" and ver["stints"][0]["compound"] == "SOFT"
    assert ver["laps"][4] == [5, 90.0, False, True] and ver["laps"][5] == [6, 90.0, True, False]
    assert out["drivers"][1]["code"] == "D44"     # unknown driver keeps a stable label


@pytest.mark.skipif(not (CACHE / "9197" / "laps.json").exists(), reason="raw cache not present")
def test_a_real_race_builds():
    load = lambda ep: json.loads((CACHE / "9197" / f"{ep}.json").read_text())  # noqa: E731
    analysis = json.loads((CACHE / "9197" / "_analysis.json").read_text())
    out = build_lap_charts(9197, load("laps"), load("stints"), load("pit"), load("race_control"), load("drivers"),
                           classification=analysis["race_classification"])
    assert out["winner"] == "VER" and out["total_laps"] >= 55 and len(out["drivers"]) == 20
