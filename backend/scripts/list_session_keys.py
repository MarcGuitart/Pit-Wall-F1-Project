#!/usr/bin/env python3
"""
The Race and Sprint session_keys of one or more seasons, from OpenF1 (Block 30a).

    python scripts/list_session_keys.py 2024
    python scripts/list_session_keys.py 2023 2024 2025 --format dispatch
    python scripts/list_session_keys.py 2025 --missing --format dispatch

Cancelled sessions (OpenF1's is_cancelled, the boolean True only) and the ones
in excluded_sessions.json are left out, with the reason on stderr. --missing
also leaves out what backend/cache already holds at the current
ANALYSIS_VERSION. --format dispatch prints exactly what the publish workflow's
session_keys input takes: the keys, comma-separated, no spaces, oldest first.

OpenF1 answering with anything but a list — a 429 after the client's retries,
a 401, an error page — is an error and a non-zero exit, never "no sessions":
an empty backfill list must mean there is nothing to do, not that we were
refused.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/ — for app.*

from app.clients.openf1_client import OpenF1Error, fetch_json  # noqa: E402
from app.core import cache  # noqa: E402
from app.core.version import ANALYSIS_VERSION  # noqa: E402
from app.services.autopublish import (  # noqa: E402
    EXCLUSIONS_FILE, is_cancelled, is_published, parse_exclusions,
)

KINDS = ("Race", "Sprint")


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def select(rows: list, excluded: dict[int, str], missing_only: bool = False) -> list[dict]:
    """Race and Sprint rows of one season, minus cancelled, excluded and (optionally) published."""
    if not isinstance(rows, list):
        raise TypeError(f"OpenF1 answered with {type(rows).__name__}, not a list")
    out = []
    for r in rows:
        if not isinstance(r, dict) or r.get("session_name") not in KINDS or not isinstance(r.get("session_key"), int):
            continue
        key = r["session_key"]
        label = f"{r.get('circuit_short_name') or '?'} {r.get('year')} · {r.get('session_name')}"
        if is_cancelled(r):
            log(f"  skip {key} {label}: OpenF1 reports is_cancelled: true")
            continue
        if key in excluded:
            log(f"  skip {key} {label}: {excluded[key]}")
            continue
        if missing_only and is_published(cache.get_full_analysis(key), ANALYSIS_VERSION):
            continue
        out.append(r)
    return sorted(out, key=lambda r: (r.get("date_start") or "", r["session_key"]))


def render(rows: list[dict], fmt: str) -> str:
    if fmt == "dispatch":
        return ",".join(str(r["session_key"]) for r in rows)
    if fmt == "json":
        return json.dumps([{"session_key": r["session_key"], "year": r.get("year"), "session_name": r.get("session_name"),
                            "circuit_short_name": r.get("circuit_short_name"), "date_start": r.get("date_start")}
                           for r in rows], indent=2)
    return "\n".join(f"{r['session_key']}\t{r.get('year')}\t{r.get('session_name')}\t{r.get('circuit_short_name')}\t{r.get('date_start')}"
                     for r in rows)


async def collect(years: list[int], excluded: dict[int, str], missing_only: bool) -> list[dict]:
    rows: list[dict] = []
    for year in years:
        answer = await fetch_json("sessions", year=year, session_type="Race")
        picked = select(answer, excluded, missing_only)
        log(f"{year}: {len(picked)} session(s) — "
            f"{sum(1 for r in picked if r['session_name'] == 'Race')} Race, "
            f"{sum(1 for r in picked if r['session_name'] == 'Sprint')} Sprint")
        rows.extend(picked)
    return rows


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Race and Sprint session_keys from OpenF1.")
    ap.add_argument("years", nargs="+", type=int)
    ap.add_argument("--format", choices=("table", "dispatch", "json"), default="table")
    ap.add_argument("--missing", action="store_true",
                    help=f"leave out sessions already in the cache at ANALYSIS_VERSION {ANALYSIS_VERSION}")
    ap.add_argument("--exclusions-file", default=str(Path(__file__).resolve().parents[1] / EXCLUSIONS_FILE))
    args = ap.parse_args(argv)

    try:
        excluded = parse_exclusions(json.loads(Path(args.exclusions_file).read_text()))
    except (OSError, json.JSONDecodeError):
        excluded = {}
    try:
        rows = asyncio.run(collect(args.years, excluded, args.missing))
    except (OpenF1Error, TypeError) as exc:
        log(f"ERROR: {exc}")
        return 2
    print(render(rows, args.format))
    return 0


if __name__ == "__main__":
    sys.exit(main())
