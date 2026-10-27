"""
One-off: complete the versioned backend/cache/meeting_<key>_sessions.json of
the 2023 to 2025 seasons, which for some meetings hold only the Race (so the
/races panel listed only the Race for them; 24 Oct sweep).

Only adds rows: every existing row stays exactly as it is; a session the
file lacks is added with the same fields the file already uses, and the rows
are ordered by start. Without --online nothing is fetched or written. With
--online: one OpenF1 /sessions request per incomplete meeting, spaced to 27
a minute (the anonymous limit; the 55/min budget is shared).

Run from backend/:  python scripts/complete_meeting_sessions.py --online
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
SPACING_S = 60 / 27
YEARS = (2023, 2024, 2025)
# The sessions a full weekend has; a file with fewer is incomplete.
MIN_SESSIONS = 5


def serialise(rows: list[dict]) -> str:
    # Same call as app.core.cache.set_sessions_for_meeting.
    return json.dumps(rows, ensure_ascii=False, default=str)


def complete(rows: list[dict], fetched: list[dict]) -> list[dict]:
    """Existing rows untouched; missing session_keys added with the file's own fields."""
    have = {r.get("session_key") for r in rows}
    fields = list(rows[0].keys()) if rows else ["session_key", "session_name", "session_type", "date_start", "location", "is_cancelled"]
    added = []
    for s in fetched:
        key = s.get("session_key")
        if not isinstance(key, int) or key in have:
            continue
        row = {f: s.get(f) for f in fields}
        if "is_cancelled" in row:
            row["is_cancelled"] = bool(s.get("is_cancelled"))
        added.append(row)
        have.add(key)
    return sorted(rows + added, key=lambda r: str(r.get("date_start") or ""))


def meetings_in_range() -> set[int]:
    keys: set[int] = set()
    for y in YEARS:
        for m in json.loads((CACHE_DIR / f"meetings_{y}.json").read_text()):
            keys.add(m["meeting_key"])
    return keys


def fetch_sessions(meeting_key: int) -> list[dict]:
    with urllib.request.urlopen(f"{BASE_URL}/sessions?meeting_key={meeting_key}", timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    ap.add_argument("--online", action="store_true", help="fetch from OpenF1 and write the files")
    args = ap.parse_args()
    in_range = meetings_in_range()
    todo = []
    for path in sorted(CACHE_DIR.glob("meeting_*_sessions.json")):
        key = int(path.name.split("_")[1])
        rows = json.loads(path.read_text(encoding="utf-8"))
        if key in in_range and len(rows) < MIN_SESSIONS:
            todo.append((key, path, rows))
    print(f"{len(todo)} incomplete file(s) for {YEARS[0]} to {YEARS[-1]}: {[k for k, _, _ in todo]}")
    if not args.online:
        print("offline: nothing fetched, nothing written (pass --online)")
        return 0
    for i, (key, path, rows) in enumerate(todo):
        if serialise(rows) != path.read_text(encoding="utf-8"):
            print(f"{path.name}: not in set_sessions_for_meeting format, left alone")
            return 1
        if i:
            time.sleep(SPACING_S)
        new = complete(rows, fetch_sessions(key))
        path.write_text(serialise(new), encoding="utf-8")
        print(f"{path.name}: {len(rows)} -> {len(new)} sessions ({', '.join(r['session_name'] for r in new)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
