#!/usr/bin/env python3
"""
The landing's sample analysis (Block 29): São Paulo 2024 · Race (9636), real.

    python3 frontend/scripts/build_landing_sample.py

Reads backend/cache/9636/_analysis.json and _session_meta.json — the analysis
production serves — and writes frontend/lib/landingSample.json: the Chaos
Index, the first five True Pace rows and the P1 driver's exclusion log as
counts by reason. Deterministic: same cache in, same bytes out; no network.
The exclusion log only carries counts ("14 laps excluded: SC/VSC"), not which
laps, so the landing draws a bar proportional by reason, not a lap-by-lap strip.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

SESSION = 9636
ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "backend" / "cache" / str(SESSION)
OUT = ROOT / "frontend" / "lib" / "landingSample.json"
LINE = re.compile(r"^\s*(\d+)\s+laps?\s+excluded:\s*(.+?)\s*$", re.I)


def main() -> int:
    analysis = json.loads((SRC / "_analysis.json").read_text(encoding="utf-8"))
    meta = json.loads((SRC / "_session_meta.json").read_text(encoding="utf-8"))
    race = analysis["race"]
    rows = sorted(analysis["true_pace"], key=lambda r: r["rank"])[:5]
    leader = rows[0]
    reasons = []
    for line in leader.get("exclusion_log") or []:
        m = LINE.match(line)
        if m:
            reasons.append({"reason": m.group(2), "laps": int(m.group(1))})
    sample = {
        "_source": f"backend/cache/{SESSION}/_analysis.json (analysis_version {analysis.get('analysis_version')})",
        "session_key": SESSION,
        "place": meta.get("location") or race.get("circuit_short_name"),
        "year": race["year"],
        "session_name": race["session_name"],
        "chaos": {"score": analysis["chaos"]["score"], "level": analysis["chaos"]["level"]},
        "true_pace": [
            {
                "rank": r["rank"],
                "driver_code": r["driver_code"],
                "team_colour": r.get("team_colour"),
                "clean_laps": r["sample_size"],
                "fastest_clean_lap": r["fastest_clean_lap"],
                "median_clean_lap": r["median_clean_lap"],
                "confidence": r["confidence"],
            }
            for r in rows
        ],
        "exclusion": {
            "driver_code": leader["driver_code"],
            "used": leader["sample_size"],
            "removed": reasons,
        },
    }
    OUT.write_text(json.dumps(sample, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {sample['place']} {sample['year']}, chaos {sample['chaos']['score']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
