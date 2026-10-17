"""scripts/audit_analyses.py — Block 30a, task 4: one finding per rule, nothing on a clean session."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("audit_analyses", BACKEND / "scripts" / "audit_analyses.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def clean(year=2024):
    drivers = 22 if year == 2026 else 20
    return {
        "race": {"session_key": 1, "year": year, "circuit_short_name": "X", "session_name": "Race"},
        "decisions": [{"title": "VER HARD — 20 lap stint", "impact": "+0.180s/lap degradation (High cliff)"}],
        "clean_air_value": {"estimated_gain": 0.3, "drivers": [{"driver_code": "ALB", "gain": 0.4, "context": "c"}]},
        "race_classification": [{"driver_number": n, "driver_code": f"D{n}", "finishing_position": n} for n in range(1, drivers + 1)],
        "true_pace": [{"sample_size": 50, "exclusion_log": ["2 laps excluded: pit in/out", "1 lap excluded: no timing data"]}],
        "chaos": {"score": 30, "components": {"safety_car": 10}},
        "pit_impact": [{"driver_number": 1, "lap_number": 20, "stop_duration": 2.4}],
    }


def put(root: Path, key: int, analysis: dict, **raw):
    d = root / str(key)
    d.mkdir(parents=True)
    (d / "_analysis.json").write_text(json.dumps(analysis))
    for name, value in raw.items():
        (d / f"{name}.json").write_text(json.dumps(value))


RC = [{"message": "SAFETY CAR DEPLOYED"}]
POS = [{"driver_number": 1, "position": 1, "date": "2024-01-01T10:00"}, {"driver_number": 2, "position": 2, "date": "2024-01-01T10:00"}]
PIT = [{"driver_number": 1, "lap_number": 20, "stop_duration": 2.4}]


def rules(root):
    rows, _ = audit.audit(root)
    return sorted((r["session_key"], r["rule"]) for r in rows)


def test_a_clean_session_raises_nothing(tmp_path):
    put(tmp_path, 1, clean(), race_control=RC, position=POS, pit=PIT)
    put(tmp_path, 2, clean(2026), race_control=RC, position=POS, pit=PIT)
    assert rules(tmp_path) == []


def test_each_rule(tmp_path):
    a = clean(); a["decisions"][0]["impact"] = "+5.339s/lap degradation (High cliff)"
    put(tmp_path, 10, a)
    a = clean(); a["decisions"][0]["impact"] = "-0.200s/lap degradation (High cliff)"
    put(tmp_path, 11, a)
    a = clean(); a["clean_air_value"]["estimated_gain"] = 0.9
    put(tmp_path, 12, a)
    a = clean(); a["clean_air_value"]["drivers"][0]["gain"] = -0.1
    put(tmp_path, 13, a)
    a = clean(); a["race_classification"] = a["race_classification"][:19]
    put(tmp_path, 14, a)
    put(tmp_path, 15, clean(), position=[{"driver_number": 2, "position": 1, "date": "2024-01-01T11:00"}])
    put(tmp_path, 16, clean(), race_control=[])
    put(tmp_path, 17, clean(), race_control=[{"message": "YELLOW IN TRACK SECTOR 3"}])
    a = clean(); a["true_pace"] = [{"sample_size": 40, "exclusion_log": ["10 laps excluded: no timing data"]}]
    put(tmp_path, 18, a)
    a = clean(); a["pit_impact"][0]["stop_duration"] = None
    put(tmp_path, 19, a, pit=PIT)
    a = clean(2025); a["pit_impact"][0]["stop_duration"] = None
    put(tmp_path, 20, a)
    assert rules(tmp_path) == [
        (10, "promoted_slope"), (11, "promoted_slope"), (12, "clean_air"), (13, "clean_air"),
        (14, "driver_count"), (15, "winner_vs_position"), (16, "chaos_without_rc"),
        (16, "sc_without_message"), (17, "sc_without_message"), (18, "no_timing_share"),
        (19, "stop_duration_dropped"), (20, "stop_duration_absent_upstream"),
    ]


def test_2026_expects_22_drivers(tmp_path):
    a = clean(2026); a["race_classification"] = a["race_classification"][:20]
    put(tmp_path, 30, a)
    assert rules(tmp_path) == [(30, "driver_count")]


def test_rules_that_need_raw_data_say_what_they_skipped(tmp_path):
    put(tmp_path, 40, clean())
    _, skipped = audit.audit(tmp_path)
    assert skipped == {"winner_vs_position": 1, "chaos/race_control": 1}


def test_thresholds_are_named_constants():
    assert (audit.MAX_PROMOTED_SLOPE, audit.MAX_CLEAN_AIR, audit.MAX_NO_TIMING_SHARE) == (1.5, 0.6, 0.05)
    assert audit.EXPECTED_DRIVERS[2026] == 22 and audit.DEFAULT_EXPECTED_DRIVERS == 20
