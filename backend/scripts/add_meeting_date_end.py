"""
One-off: add "date_end" (the last session's end, i.e. the weekend's end) to
the versioned season lists backend/cache/meetings_<year>.json.

Only the date_end key is added, right after date_start; every other byte of
the file stays as cache.set_meetings wrote it. Without --online nothing is
fetched and nothing is written. With --online: one OpenF1 /sessions request
per season, spaced out (the 55/min budget is shared).

Run from backend/:  python scripts/add_meeting_date_end.py --online [--years 2023 2024 2025]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

CACHE_DIR = Path(__file__).resolve().parent.parent / "cache"
BASE_URL = os.environ.get("OPENF1_BASE_URL", "https://api.openf1.org/v1")
SPACING_S = 3.0


def weekend_ends(sessions: list[dict]) -> dict[int, str]:
    """meeting_key -> the latest session date_end of that meeting."""
    ends: dict[int, str] = {}
    for s in sessions:
        key, end = s.get("meeting_key"), s.get("date_end")
        if key is None or not end:
            continue
        if key not in ends or end > ends[key]:
            ends[key] = end
    return ends


def with_date_end(rows: list[dict], ends: dict[int, str]) -> list[dict]:
    """Copy of rows with date_end inserted after date_start where known."""
    out = []
    for row in rows:
        end = ends.get(row.get("meeting_key"))
        if end is None or "date_end" in row:
            out.append(row)
            continue
        new: dict = {}
        for k, v in row.items():
            new[k] = v
            if k == "date_start":
                new["date_end"] = end
        if "date_end" not in new:
            new["date_end"] = end
        out.append(new)
    return out


def serialise(rows: list[dict]) -> str:
    # Same call as app.core.cache.set_meetings.
    return json.dumps(rows, ensure_ascii=False, default=str)


def fetch_sessions(year: int) -> list[dict]:
    with urllib.request.urlopen(f"{BASE_URL}/sessions?year={year}", timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    ap.add_argument("--online", action="store_true", help="fetch from OpenF1 and write the files")
    ap.add_argument("--years", type=int, nargs="+", default=[2023, 2024, 2025])
    args = ap.parse_args()
    if not args.online:
        print("offline: nothing fetched, nothing written (pass --online)")
        return 0
    missing = 0
    for i, year in enumerate(args.years):
        path = CACHE_DIR / f"meetings_{year}.json"
        raw = path.read_text(encoding="utf-8")
        rows = json.loads(raw)
        if serialise(rows) != raw:
            print(f"{path.name}: not in set_meetings format, left alone")
            return 1
        if i:
            time.sleep(SPACING_S)
        ends = weekend_ends(fetch_sessions(year))
        new = with_date_end(rows, ends)
        gaps = [r["meeting_key"] for r in new if "date_end" not in r]
        missing += len(gaps)
        path.write_text(serialise(new), encoding="utf-8")
        print(f"{path.name}: {len(rows) - len(gaps)}/{len(rows)} meetings with date_end"
              + (f", none for {gaps}" if gaps else ""))
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
