"""
Decide which finished races to publish, and compute them. Run by a GitHub Action.

    python scripts/autopublish.py                          # cron: pick candidates
    python scripts/autopublish.py --session-keys 11377      # a specific session
    python scripts/autopublish.py --dry-run                 # decide, compute nothing

It writes three things and nothing else:

  backend/cache/<key>/_analysis.json     the analysis, committed by the workflow
  backend/cache/<key>/_session_meta.json its metadata, committed too
  --state-file                           lap counts seen this run, for the
                                         "stable between runs" condition

The raw endpoints are written to backend/cache/<key>/ as a side effect of
computing (that is how the pipeline works) but the workflow does not commit
them: intervals.json alone is 3.7 MB for one race, against 72 KB for the whole
analysis, and the analysis is all the site serves.

It does not commit, push, or notify. It prints a JSON report on the last line of
stdout, prefixed REPORT:, and the workflow acts on that. Keeping git and
Telegram out of here means this script can be run against production data from
a laptop without any risk of publishing something.

Exit codes: 0 nothing to do or published; 1 a session is stuck; 2 a hard error.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, ".")

from app.clients.openf1_client import OpenF1Error, fetch_json  # noqa: E402
from app.core import cache  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.version import ANALYSIS_VERSION  # noqa: E402
from app.services.autopublish import (  # noqa: E402
    MAX_PER_RUN,
    Candidate,
    is_published,
    publishable,
    readiness,
    select_candidates,
)


def log(msg: str) -> None:
    print(msg, flush=True)


# ── the state file: lap counts from the previous run ─────────────────────────
#
# Held in the Action cache, not the repo. Committing it would mean a commit on
# every run of a race weekend, each one a production deploy, for a file nothing
# serves. A cache miss simply reads as "no previous observation", which delays a
# publication by one run — the safe direction.

def read_state(path: Path) -> dict[str, int]:
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return {}
    return {k: v for k, v in (data.get("lap_counts") or {}).items() if isinstance(v, int)}


def write_state(path: Path, lap_counts: dict[str, int]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({
        "written_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "lap_counts": lap_counts,
    }, indent=2))


# ── one session ──────────────────────────────────────────────────────────────

async def compute(session_key: int) -> dict:
    """Run the real /analysis pipeline in-process and return the analysis."""
    from fastapi.testclient import TestClient
    from app.main import app

    t0 = time.time()
    with TestClient(app, raise_server_exceptions=False) as client:
        r = client.get(f"/analysis/{session_key}?force_refresh=true")
    took = time.time() - t0
    if r.status_code != 200:
        err = (r.json().get("error") or {})
        raise RuntimeError(f"/analysis returned {r.status_code} {err.get('code')}: {err.get('message')}")
    log(f"    computed in {took:.0f}s")
    return r.json()


def headline(analysis: dict) -> dict:
    """The few facts a notification needs. No opinions, no recomputation."""
    chaos = analysis.get("chaos") or {}
    winner = next(
        (r for r in (analysis.get("race_classification") or []) if r.get("finishing_position") == 1),
        None,
    )
    modules = analysis.get("modules") or {}
    return {
        "meeting_name": (analysis.get("race") or {}).get("meeting_name"),
        "session_name": (analysis.get("race") or {}).get("session_name"),
        "year": (analysis.get("race") or {}).get("year"),
        "winner": (winner or {}).get("driver_code"),
        "winner_grid": (winner or {}).get("grid_position"),
        "chaos_score": chaos.get("score"),
        "chaos_level": chaos.get("level"),
        "modules_failed": sorted(k for k, v in modules.items() if v.get("status") == "failed"),
    }


async def run(session_keys: list[int] | None, state_path: Path, dry_run: bool, year: int | None) -> dict:
    now = datetime.now(timezone.utc)
    state = read_state(state_path)
    report: dict = {
        "at": now.isoformat(timespec="seconds"),
        "analysis_version": ANALYSIS_VERSION,
        "published": [],
        "waiting": [],
        "stuck": [],
        "deferred": [],
        "errors": [],
    }

    # ── candidates ───────────────────────────────────────────────────────────
    if session_keys:
        metas: list[dict] = []
        for key in session_keys:
            rows = await fetch_json("sessions", session_key=key)
            if not rows:
                report["errors"].append({"session_key": key, "error": "OpenF1 knows no such session"})
                continue
            metas.append(rows[0])
        # An explicit request bypasses the year filter but not the readiness
        # check: asking for a session by hand must not publish a live race.
        done: set[int] = set()
        candidates = [c for m in metas for c in select_candidates([m], done, now, m.get("year"))]
    else:
        year = year or now.year
        try:
            metas = await fetch_json("sessions", year=year)
        except OpenF1Error as exc:
            report["errors"].append({"error": f"could not list {year} sessions: {exc}"})
            return report
        done = {
            m["session_key"] for m in metas
            if isinstance(m.get("session_key"), int)
            and is_published(cache.get_full_analysis(m["session_key"]), ANALYSIS_VERSION)
        }
        candidates = select_candidates(metas, done, now, year)
        log(f"{len(metas)} sessions in {year}: {len(done)} already published at v{ANALYSIS_VERSION}, "
            f"{len(candidates)} candidate race session(s)")

    # ── readiness ────────────────────────────────────────────────────────────
    ready: list[Candidate] = []
    for c in candidates:
        try:
            race_control = await fetch_json("race_control", session_key=c.session_key)
            laps = await fetch_json("laps", session_key=c.session_key)
        except OpenF1Error as exc:
            report["errors"].append({"session_key": c.session_key, "error": str(exc)})
            continue
        previous = state.get(str(c.session_key))
        r = readiness(c, race_control, laps, previous, now)
        state[str(c.session_key)] = r.lap_count
        entry = {"session_key": c.session_key, "label": c.label, "why": r.why(),
                 "missing": r.missing(), **{k: v for k, v in asdict(r).items()}}
        log(f"  {c.session_key} {c.label}: {r.why()}")
        if r.ready:
            ready.append(c)
        elif r.stuck:
            report["stuck"].append(entry)
        else:
            report["waiting"].append(entry)

    write_state(state_path, state)

    # ── publish ──────────────────────────────────────────────────────────────
    now_publish, deferred = publishable(ready, MAX_PER_RUN)
    report["deferred"] = [{"session_key": c.session_key, "label": c.label} for c in deferred]
    if deferred:
        log(f"  {len(deferred)} ready session(s) deferred to the next run (cap {MAX_PER_RUN})")

    for c in now_publish:
        log(f"  publishing {c.session_key} {c.label}")
        if dry_run:
            report["published"].append({"session_key": c.session_key, "label": c.label, "dry_run": True})
            continue
        try:
            analysis = await compute(c.session_key)
        except Exception as exc:
            log(f"    FAILED: {exc}")
            report["errors"].append({"session_key": c.session_key, "label": c.label, "error": str(exc)})
            continue
        report["published"].append({
            "session_key": c.session_key,
            "label": c.label,
            "url": f"https://pitwallengineer.com/race/{c.session_key}",
            **headline(analysis),
        })

    return report


def main() -> int:
    ap = argparse.ArgumentParser(description="Publish the analysis of a finished race.")
    ap.add_argument("--session-keys", help="comma-separated keys instead of the automatic search")
    ap.add_argument("--year", type=int, help="season to search (default: the current year)")
    ap.add_argument("--state-file", default=".autopublish-state.json",
                    help="where the previous run's lap counts live")
    ap.add_argument("--dry-run", action="store_true", help="decide and report, compute nothing")
    ap.add_argument("--cache-dir", help="write the cache somewhere else (backend/cache/ is versioned)")
    args = ap.parse_args()

    if args.cache_dir:
        settings.cache_dir = args.cache_dir
        log(f"cache redirected to {args.cache_dir}")

    keys: list[int] | None = None
    if args.session_keys:
        try:
            keys = [int(k) for k in args.session_keys.replace(" ", "").split(",") if k]
        except ValueError:
            log("--session-keys must be integers separated by commas")
            return 2

    report = asyncio.run(run(keys, Path(args.state_file), args.dry_run, args.year))
    log("REPORT:" + json.dumps(report, default=str))

    if report["errors"]:
        return 2
    return 1 if report["stuck"] else 0


if __name__ == "__main__":
    sys.exit(main())
