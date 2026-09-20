"""
Audit backend/cache/: find sessions whose raw OpenF1 files are empty or
suspiciously small (a cached error would look like a quiet race).

Read-only. Run from backend/:  python scripts/audit_cache.py [--cache-dir PATH]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

RAW_ENDPOINTS = ["laps", "stints", "pit", "position", "intervals", "race_control", "weather", "drivers"]

# Below these record counts a Race session is almost certainly incomplete.
# (A 2024 race: ~1 000+ laps rows, ~60 stints, ~20 drivers, thousands of positions.)
MIN_RECORDS = {
    "laps": 100, "stints": 20, "pit": 5, "position": 200,
    "intervals": 200, "race_control": 10, "weather": 30, "drivers": 15,
}


def audit(cache_dir: Path) -> list[dict]:
    rows: list[dict] = []
    for d in sorted(p for p in cache_dir.iterdir() if p.is_dir() and p.name.isdigit()):
        row = {"session": d.name, "flags": [], "counts": {}}
        for ep in RAW_ENDPOINTS:
            f = d / f"{ep}.json"
            if not f.exists():
                row["flags"].append(f"{ep}: MISSING")
                continue
            size = f.stat().st_size
            try:
                data = json.loads(f.read_text())
            except json.JSONDecodeError:
                row["flags"].append(f"{ep}: UNREADABLE ({size} B)")
                continue
            if not isinstance(data, list):
                row["flags"].append(f"{ep}: NOT A LIST ({type(data).__name__}, {size} B)")
                continue
            n = len(data)
            row["counts"][ep] = n
            if n == 0:
                row["flags"].append(f"{ep}: EMPTY []")
            elif n < MIN_RECORDS[ep]:
                row["flags"].append(f"{ep}: only {n} records ({size} B)")
        row["has_meta"] = (d / "_session_meta.json").exists()
        row["has_analysis"] = (d / "_analysis.json").exists()
        rows.append(row)
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache-dir", default=str(Path(__file__).resolve().parent.parent / "cache"))
    args = ap.parse_args()
    rows = audit(Path(args.cache_dir))

    suspicious = 0
    for r in rows:
        counts = " ".join(f"{ep}={r['counts'].get(ep, '-')}" for ep in RAW_ENDPOINTS)
        meta = "meta" if r["has_meta"] else "NO-META"
        ana = "analysis" if r["has_analysis"] else "NO-ANALYSIS"
        print(f"{r['session']:>6}  {meta:8} {ana:12} {counts}")
        for flag in r["flags"]:
            suspicious += 1
            print(f"        ! {flag}")
    print(f"\n{len(rows)} session dir(s), {suspicious} flag(s).")
    return 1 if suspicious else 0


if __name__ == "__main__":
    sys.exit(main())
