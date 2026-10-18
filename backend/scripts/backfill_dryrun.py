#!/usr/bin/env python3
"""
A backfill rehearsal (Block 30a, task 3): the real publish run, session by
session, into a temporary cache — nothing is written to backend/cache and
nothing is committed.

    python scripts/backfill_dryrun.py --session-keys 9472,9480,... --out report.json

For each session it records: wall time, time spent in OpenF1 requests (limiter
waits included), the number of OpenF1 requests, the result (published /
waiting / stuck / error and why) and the size on disk — the files the workflow
would commit and the raw endpoints it would not. The extrapolation to another
request rate (default 55/min, the account limit) is computing time plus
requests at that rate.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/
sys.path.insert(0, str(Path(__file__).resolve().parent))      # scripts/

from pydantic import SecretStr  # noqa: E402

from app.clients import openf1_client  # noqa: E402
from app.core.config import settings  # noqa: E402

COMMITTED = ("_analysis.json", "_session_meta.json", "_lap_charts.json")


def size(path: Path) -> tuple[int, int]:
    committed = raw = 0
    if path.is_dir():
        for f in path.iterdir():
            if f.is_file():
                (committed := committed + f.stat().st_size) if f.name in COMMITTED else (raw := raw + f.stat().st_size)
    return committed, raw


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session-keys", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--rate", type=float, default=55.0, help="requests/min to extrapolate to")
    args = ap.parse_args()
    keys = [int(k) for k in args.session_keys.split(",") if k]

    workdir = Path(tempfile.mkdtemp(prefix="pitwall-backfill-dryrun-"))
    settings.cache_dir = str(workdir / "cache")
    # compute() goes through the PRO gate like the Action does; any value works
    # in-process (the gate compares against this same setting).
    settings.internal_build_secret = SecretStr("backfill-dry-run")

    import autopublish as script  # noqa: E402  (after the cache is redirected)

    stats = {"requests": 0, "in_requests_s": 0.0}
    real_get = openf1_client._get

    async def counted(client, endpoint, params):
        stats["requests"] += 1
        t = time.monotonic()
        try:
            return await real_get(client, endpoint, params)
        finally:
            stats["in_requests_s"] += time.monotonic() - t

    openf1_client._get = counted

    rows = []
    for key in keys:
        before_n, before_t = stats["requests"], stats["in_requests_s"]
        t0 = time.monotonic()
        report = asyncio.run(script.run([key], workdir / "state.json", False, None, Path(script.EXCLUSIONS_FILE), 0))
        wall = time.monotonic() - t0
        n = stats["requests"] - before_n
        net = stats["in_requests_s"] - before_t
        committed, raw = size(workdir / "cache" / str(key))
        outcome, why = "unknown", ""
        for kind in ("published", "stuck", "waiting", "skipped", "errors"):
            hit = [r for r in report.get(kind) or [] if r.get("session_key") == key]
            if hit:
                outcome, why = kind, hit[0].get("why") or hit[0].get("error") or hit[0].get("label") or ""
                break
        label = next((r.get("label") for k in ("published", "stuck", "waiting", "errors") for r in report.get(k) or [] if r.get("label")), "")
        row = {"session_key": key, "label": label, "outcome": outcome, "why": why, "wall_s": round(wall, 1),
               "requests": n, "requests_s": round(net, 1), "compute_s": round(max(0.0, wall - net), 1),
               "at_rate_s": round(max(0.0, wall - net) + n * 60.0 / args.rate, 1),
               "committed_bytes": committed, "raw_bytes": raw}
        rows.append(row)
        print(json.dumps(row), flush=True)

    Path(args.out).write_text(json.dumps({"workdir": str(workdir), "rate": args.rate, "sessions": rows}, indent=2))
    print(f"wrote {args.out}; temporary cache {workdir}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
