"""Block 36: the OpenF1 telemetry script and the R2 index (no network)."""
import json
import math

from scripts.openf1_telemetry import g_forces, official_length, pick_laps, trace, ts
from scripts.telemetry_index import build as build_index


def lap(n, dur, pit_out=False):
    return {"lap_number": n, "lap_duration": dur, "date_start": f"2026-10-25T20:{n:02d}:00+00:00", "is_pit_out_lap": pit_out}


def test_pick_laps_skips_pit_laps_and_finds_fastest_and_median():
    laps = [lap(1, 101.0), lap(2, 99.0), lap(3, 120.0), lap(4, 130.0, pit_out=True), lap(5, 100.0), lap(6, 98.5)]
    picked = pick_laps(laps)
    assert picked["fastest_clean"]["lap_number"] == 6          # 98.5; lap 3 is a pit-in (before a pit-out)
    assert picked["representative"]["lap_number"] in (2, 5)    # median of 101, 99, 100, 98.5 is 99.5: 99 or 100


def test_ts_reads_dates_without_an_offset_as_utc():
    assert ts("2026-10-25T21:39:01") == ts("2026-10-25T21:39:01+00:00") == ts("2026-10-25T21:39:01Z")


def test_official_length_comes_from_the_shared_table_with_its_source():
    assert official_length("Austin", 2026) == (5513.0, "https://www.formula1.com/en/racing/2026/united-states")
    assert official_length("interlagos", 2025)[0] == 4309.0      # no 2025 row: the nearest season
    assert official_length("Kuala Lumpur", 2026)[0] == 5543.0
    assert official_length("Nowhere", 2026) == (None, None)


def test_every_row_of_the_table_has_a_length_and_a_formula1_source():
    rows = json.load(open(official_length.__globals__["LENGTHS_FILE"]))["rows"]
    assert len(rows) == 72
    assert all(r["length_m"] and r["source"].startswith("https://www.formula1.com/en/racing/") for r in rows)


def test_trace_is_scaled_to_the_official_length():
    # 60 s at a constant 300 km/h integrates to 5000 m; scaled, every point sits at race_time x 5513 / 60
    start = ts("2026-10-25T20:00:00+00:00")
    times = [i * 0.27 for i in range(222)]
    iso = lambda t: f"2026-10-25T20:00:{t:06.3f}+00:00"
    car = [{"date": iso(t), "speed": 300, "throttle": 100, "brake": 0, "n_gear": 8, "drs": 0} for t in times]
    loc = [{"date": iso(t), "x": round(t * 833.3), "y": 0} for t in times]
    pts = trace(car, loc, start, start + 60, 5513.0)
    assert pts[0]["distance"] == 0
    for p in pts[1:]:
        assert math.isclose(p["distance"], p["race_time"] * 5513.0 / 60, rel_tol=0.01)


def test_g_forces_on_a_circle_are_v2_over_r():
    # 200 km/h on a 100 m radius: 55.6² / 100 / 9.81 ≈ 3.15 g, constant speed so no longitudinal g
    r, v = 100.0, 200.0
    n = 120
    ang = [i * 0.05 for i in range(n)]
    xs = [r * math.cos(a) for a in ang]
    ys = [r * math.sin(a) for a in ang]
    dist = [r * a for a in ang]
    lat, lon = g_forces(xs, ys, [v] * n, dist)
    mid = lat[20:-20]
    assert all(abs(g - 3.15) < 0.05 for g in mid)           # anticlockwise = left = positive
    assert all(abs(g) < 1e-6 for g in lon[20:-20])


def test_index_lists_races_with_a_fastest_file_and_their_last_update():
    listing = [
        "2026-10-30 12:00:00     142521 telemetry/v1/11396/fastest_clean.json",
        "2026-10-30 12:00:05     144750 telemetry/v1/11396/representative.json",
        "2026-10-29 09:00:00      96948 telemetry/v1/9636/fastest_clean.json",
        "2026-10-29 09:00:00      96948 telemetry/v1/9539/representative.json",   # no fastest file: not listed
        "2026-10-30 12:00:10        900 telemetry/v1/index.json",
    ]
    idx = build_index(listing)
    assert list(idx["sessions"]) == ["9636", "11396"]
    assert idx["sessions"]["11396"] == {"modes": ["fastest_clean", "representative"], "updated": "2026-10-30T12:00:05Z"}
