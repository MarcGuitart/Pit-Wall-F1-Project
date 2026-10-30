#!/usr/bin/env python3
"""
The R2 telemetry index (block 36): which races have OpenF1 telemetry, rebuilt from the bucket's listing, so it
never depends on what one batch remembers.

    aws s3 ls "s3://$R2_BUCKET/telemetry/v1/" --recursive --endpoint-url "$R2_ENDPOINT" \\
      | python scripts/telemetry_index.py > index.json

Input: `aws s3 ls --recursive` lines ("2026-10-30 12:00:00     142521 telemetry/v1/11396/fastest_clean.json").
Output: {"version": 1, "generated": ISO, "sessions": {"11396": {"modes": [...], "updated": ISO}}}. A race is
listed once its fastest_clean file is there; the site asks the index nothing — it requests the file and falls
back to the API on a 404 — so the index serves the workflow (what to skip) and anyone checking coverage.
"""
from __future__ import annotations

import json, re, sys
from datetime import datetime, timezone

LINE = re.compile(r"^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\s+\d+\s+telemetry/v1/(\d+)/(fastest_clean|representative)\.json$")


def build(lines) -> dict:
    sessions: dict[str, dict] = {}
    for raw in lines:
        m = LINE.match(raw.strip())
        if not m:
            continue
        day, clock, key, mode = m.groups()
        s = sessions.setdefault(key, {"modes": [], "updated": ""})
        s["modes"] = sorted(set(s["modes"]) | {mode})
        s["updated"] = max(s["updated"], f"{day}T{clock}Z")
    sessions = {k: v for k, v in sessions.items() if "fastest_clean" in v["modes"]}
    return {"version": 1, "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "sessions": dict(sorted(sessions.items(), key=lambda kv: int(kv[0])))}


if __name__ == "__main__":
    json.dump(build(sys.stdin), sys.stdout, indent=1)
    sys.stdout.write("\n")
