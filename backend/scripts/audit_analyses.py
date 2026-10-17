#!/usr/bin/env python3
"""
Audit computed analyses for figures worth a human look (Block 30a, task 4).

    python scripts/audit_analyses.py [--cache DIR] [--format table|json]

Reads <cache>/<session_key>/_analysis.json (and the raw endpoints next to it
when present: position.json, race_control.json, pit.json, drivers.json) and
prints one row per finding: session | rule | value. It changes nothing; a row
is a question, not a verdict. Rules that need a raw endpoint skip a session
that does not have it (the versioned cache keeps only the analysis) and say
how many they skipped.

Rules (thresholds below, by name):
  promoted_slope         a tyre decision promoted with a slope > MAX_PROMOTED_SLOPE
                         or < MIN_PROMOTED_SLOPE s/lap
  clean_air              clean-air gain > MAX_CLEAN_AIR or < MIN_CLEAN_AIR s/lap
                         (the headline estimate and each driver's)
  driver_count           classified drivers ≠ EXPECTED_DRIVERS for the season
  winner_vs_position     classification P1 ≠ P1 in the last position.json rows
  chaos_without_rc       a Chaos score with no race_control messages at all
  sc_without_message     a safety-car component with no SC/VSC message
  no_timing_share        > MAX_NO_TIMING_SHARE of the laps examined were
                         "no timing data"
  stop_duration_dropped  pit.json has stop_duration and the analysis lost it
  stop_duration_absent_upstream
                         no stop at all carries stop_duration in a season where
                         OpenF1 publishes it (from STOP_DURATION_FROM_SEASON)
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

MAX_PROMOTED_SLOPE = 1.5          # s/lap
MIN_PROMOTED_SLOPE = 0.0          # s/lap — a promoted "degradation" that improves is an artefact
MAX_CLEAN_AIR = 0.6               # s/lap
MIN_CLEAN_AIR = 0.0               # s/lap
EXPECTED_DRIVERS = {2026: 22}     # the 2026 grid has eleven teams
DEFAULT_EXPECTED_DRIVERS = 20
MAX_NO_TIMING_SHARE = 0.05
STOP_DURATION_FROM_SEASON = 2025  # OpenF1 began publishing stop_duration in late 2024

SLOPE_IN_IMPACT = re.compile(r"([+-]?\d+(?:\.\d+)?)\s*s/lap degradation")
EXCLUDED = re.compile(r"^\s*(\d+)\s+laps?\s+excluded:\s*(.+?)\s*$", re.I)
SC_MESSAGE = re.compile(r"SAFETY CAR|\bVSC\b", re.I)


def _raw(d: Path, name: str):
    p = d / f"{name}.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except (OSError, json.JSONDecodeError):
        return None


def audit_one(d: Path, a: dict, skipped: dict) -> list[dict]:
    key = int(d.name)
    race = a.get("race") or {}
    label = f"{key} {race.get('circuit_short_name') or '?'} {race.get('year')} {race.get('session_name') or ''}".strip()
    out: list[dict] = []

    def add(rule: str, value: str) -> None:
        out.append({"session": label, "session_key": key, "rule": rule, "value": value})

    for dec in a.get("decisions") or []:
        m = SLOPE_IN_IMPACT.search(dec.get("impact") or "")
        if m:
            slope = float(m.group(1))
            if slope > MAX_PROMOTED_SLOPE or slope < MIN_PROMOTED_SLOPE:
                add("promoted_slope", f"{dec.get('title')}: {slope:+.3f} s/lap")

    cav = a.get("clean_air_value") or {}
    est = cav.get("estimated_gain")
    if isinstance(est, (int, float)) and (est > MAX_CLEAN_AIR or est < MIN_CLEAN_AIR):
        add("clean_air", f"estimated gain {est:+.3f} s/lap")
    for drv in cav.get("drivers") or []:
        g = drv.get("gain")
        if isinstance(g, (int, float)) and (g > MAX_CLEAN_AIR or g < MIN_CLEAN_AIR):
            add("clean_air", f"{drv.get('driver_code')} {g:+.3f} s/lap ({drv.get('context')})")

    year = race.get("year")
    classified = a.get("race_classification") or []
    expected = EXPECTED_DRIVERS.get(year, DEFAULT_EXPECTED_DRIVERS)
    if classified and len(classified) != expected:
        drivers_raw = _raw(d, "drivers")
        add("driver_count", f"{len(classified)} classified, {len(a.get('true_pace') or [])} with pace, "
                            f"drivers.json {len(drivers_raw) if isinstance(drivers_raw, list) else 'n/a'}; expected {expected}")

    winner = next((r for r in classified if r.get("finishing_position") == 1), None)
    position = _raw(d, "position")
    if winner and isinstance(position, list) and position:
        last: dict[int, dict] = {}
        for row in position:
            n = row.get("driver_number")
            if isinstance(n, int) and (n not in last or (row.get("date") or "") >= (last[n].get("date") or "")):
                last[n] = row
        p1 = [n for n, r in last.items() if r.get("position") == 1]
        if p1 and winner.get("driver_number") not in p1:
            add("winner_vs_position", f"classification P1 #{winner.get('driver_number')} {winner.get('driver_code')}, position.json P1 #{p1}")
    elif winner:
        skipped["winner_vs_position"] = skipped.get("winner_vs_position", 0) + 1

    chaos = a.get("chaos") or {}
    rc = _raw(d, "race_control")
    if isinstance(rc, list):
        if (chaos.get("score") or 0) > 0 and not rc:
            add("chaos_without_rc", f"Chaos {chaos.get('score')} with no race_control messages")
        if ((chaos.get("components") or {}).get("safety_car") or 0) > 0 and not any(
                SC_MESSAGE.search(str(m.get("message") or "")) for m in rc):
            add("sc_without_message", f"safety_car component {chaos['components']['safety_car']}, no SC/VSC message")
    else:
        skipped["chaos/race_control"] = skipped.get("chaos/race_control", 0) + 1

    no_timing = examined = 0
    for row in a.get("true_pace") or []:
        examined += row.get("sample_size") or 0
        for line in row.get("exclusion_log") or []:
            m = EXCLUDED.match(line)
            if m:
                examined += int(m.group(1))
                if "no timing" in m.group(2).lower():
                    no_timing += int(m.group(1))
    if examined and no_timing / examined > MAX_NO_TIMING_SHARE:
        add("no_timing_share", f"{no_timing}/{examined} laps ({no_timing / examined:.1%}) with no timing data")

    pits = a.get("pit_impact") or []
    pit_raw = _raw(d, "pit")
    if isinstance(pit_raw, list):
        raw_has = {(r.get("driver_number"), r.get("lap_number")) for r in pit_raw if r.get("stop_duration") is not None}
        lost = [p for p in pits if p.get("stop_duration") is None and (p.get("driver_number"), p.get("lap_number")) in raw_has]
        if lost:
            add("stop_duration_dropped", f"{len(lost)} stop(s) have it in pit.json and not in the analysis")
    if isinstance(year, int) and year >= STOP_DURATION_FROM_SEASON and pits and all(p.get("stop_duration") is None for p in pits):
        add("stop_duration_absent_upstream", f"none of {len(pits)} stops carries stop_duration")
    return out


def audit(root: Path) -> tuple[list[dict], dict]:
    rows: list[dict] = []
    skipped: dict = {}
    for p in sorted(root.glob("*/_analysis.json"), key=lambda p: int(p.parent.name) if p.parent.name.isdigit() else 0):
        if not p.parent.name.isdigit():
            continue
        try:
            a = json.loads(p.read_text())
        except (OSError, json.JSONDecodeError):
            rows.append({"session": p.parent.name, "session_key": int(p.parent.name), "rule": "unreadable", "value": str(p)})
            continue
        rows.extend(audit_one(p.parent, a, skipped))
    return rows, skipped


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Flag analysis figures worth a human look.")
    ap.add_argument("--cache", default=str(Path(__file__).resolve().parents[1] / "cache"))
    ap.add_argument("--format", choices=("table", "json"), default="table")
    args = ap.parse_args(argv)
    rows, skipped = audit(Path(args.cache))
    if args.format == "json":
        print(json.dumps({"findings": rows, "skipped_no_raw": skipped}, indent=2, ensure_ascii=False))
    else:
        print("| session | rule | value |\n|---|---|---|")
        for r in rows:
            print(f"| {r['session']} | {r['rule']} | {r['value']} |")
        if skipped:
            print("\nskipped for lack of raw endpoints: " + ", ".join(f"{k} ×{v}" for k, v in skipped.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
