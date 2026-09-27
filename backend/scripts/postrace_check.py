"""
Pre-flight / post-race check for one session. Run it by hand.

    python scripts/postrace_check.py 11377            # probe only, nothing computed
    python scripts/postrace_check.py 11377 --analyse  # also run /analysis and time it
    python scripts/postrace_check.py 11377 --analyse --force   # ignore the historical gate

What it reports, in the order that actually blocks you:

  1. the historical gate — /analysis refuses a session it thinks may still be
     live, and the estimate is date_start + a per-type duration, NOT the
     date_end OpenF1 publishes. For a Race that is 3 h, so a two-hour race is
     locked for 90 min after the flag.
  2. endpoint availability — each of the 9 endpoints /analysis needs, read
     through the real client (no caching), plus session_result, which
     /analysis never asks for but takes minutes to appear.
  3. cache state — whether an analysis already exists and under which chaos
     method, i.e. whether a request would be served or recomputed.
  4. with --analyse: the actual call, timed, reporting the module statuses or
     the error envelope.

Read-only by default. --analyse writes cache/<session_key>/ for THAT session
only (raw endpoints + _analysis.json); it never touches another session. Note
that backend/cache/ IS versioned, so use --cache-dir to verify against a
throwaway directory when you only want to know whether the path works.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, ".")

from app.clients.openf1_client import RACE_ENDPOINTS, OpenF1Error, fetch_json  # noqa: E402
from app.core import cache  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.services.chaos_service import METHOD_VERSION  # noqa: E402
from app.utils.time import is_session_historical, session_end, unlock_buffer  # noqa: E402

OK, WARN, BAD, DIM = "  OK ", " WARN", " FAIL", "     "


def mins(td) -> str:
    m = td.total_seconds() / 60
    return f"{m:+.0f} min"


async def probe(session_key: int, analyse: bool, force: bool) -> int:
    print(f"\n=== session {session_key} · {datetime.now(timezone.utc).isoformat(timespec='seconds')} "
          f"· mode={'authenticated' if settings.openf1_credentials_configured else 'anonymous'}\n")

    # ── 1. session metadata and the historical gate ──────────────────────────
    try:
        rows = await fetch_json("sessions", session_key=session_key)
    except OpenF1Error as exc:
        print(f"{BAD} could not read session metadata: {exc}")
        return 2
    if not rows:
        print(f"{BAD} OpenF1 knows no session {session_key}")
        return 2
    meta = rows[0]
    name = f"{meta.get('session_name')} · {meta.get('circuit_short_name')} · {meta.get('year')}"
    print(f"  session: {name}  (meeting {meta.get('meeting_key')}, type {meta.get('session_type')})")

    now = datetime.now(timezone.utc)
    ds = meta.get("date_start")
    de = meta.get("date_end")
    print(f"  date_start: {ds}")
    print(f"  date_end:   {de}   <- published by OpenF1")

    gate_ok = True
    if ds:
        stype = meta.get("session_type", "Race")
        end, source = session_end(ds, stype, de)
        historical, unlock = is_session_historical(ds, stype, de)
        print(f"  end used by the guard: {end.isoformat(timespec='seconds')} ({source})")
        print(f"  unlock_at:  {unlock.isoformat(timespec='seconds')}  "
              f"(end + {unlock_buffer().total_seconds() / 60:.0f} min buffer)")
        if source == "estimated":
            print(f"{WARN} no usable date_end, so the per-type duration was used — generous by design")
        if de:
            real_end = datetime.fromisoformat(de.replace("Z", "+00:00"))
            over = unlock - real_end
            tag = OK if over <= unlock_buffer() else WARN
            print(f"{tag} the gate opens {mins(over)} after the real date_end "
                  + ("— the buffer, nothing more" if tag == OK else "— longer than the buffer"))
            if real_end <= now < unlock:
                print(f"{WARN} the session has ENDED but /analysis will answer 425 for another "
                      f"{mins(unlock - now)} (use --force / force_refresh=true to bypass)")
        if historical:
            print(f"{OK} the historical gate is open")
        else:
            gate_ok = False
            print(f"{WARN} the historical gate is CLOSED — /analysis returns 425 "
                  f"SESSION_NOT_HISTORICAL_YET for {mins(unlock - now)}")
    else:
        print(f"{WARN} no date_start: the guard is skipped entirely")

    # ── 2. endpoint availability (no caching: fetch_json does not write) ─────
    print(f"\n  endpoints /analysis needs ({len(RACE_ENDPOINTS)}), read live:")
    missing, empty = [], []
    for ep in RACE_ENDPOINTS:
        try:
            data = await fetch_json(ep, session_key=session_key)
            n = len(data)
            if n == 0:
                empty.append(ep)
                tag = BAD if ep == "laps" else WARN
                print(f"{tag} {ep:<14} 0 rows")
            else:
                print(f"{OK} {ep:<14} {n} rows")
        except OpenF1Error as exc:
            missing.append(ep)
            print(f"{BAD} {ep:<14} {type(exc).__name__}: {exc}")

    # session_result: /analysis never asks for it, but it is the slow one
    try:
        sr = await fetch_json("session_result", session_key=session_key)
        print(f"{OK if sr else WARN} {'session_result':<14} {len(sr)} rows   "
              f"<- NOT used by /analysis (classification comes from position data)")
    except OpenF1Error as exc:
        print(f"{WARN} {'session_result':<14} unavailable ({exc})   "
              f"<- NOT used by /analysis, so this does not block anything")

    # ── 3. cache state ───────────────────────────────────────────────────────
    print(f"\n  cache state (cache_dir={settings.cache_path}):")
    raw_cached = [ep for ep in RACE_ENDPOINTS if cache.get(session_key, ep) is not None]
    print(f"{DIM} raw endpoints cached: {len(raw_cached)}/{len(RACE_ENDPOINTS)}"
          + (f" ({', '.join(raw_cached)})" if raw_cached else ""))
    existing = cache.get_full_analysis(session_key)
    if existing is None:
        print(f"{DIM} no _analysis.json — a request would COMPUTE from scratch")
        print(f"{OK} the block-5 guard returns None for a missing file (no ANALYSIS_FAILED)")
    else:
        v = (existing.get("chaos") or {}).get("method_version")
        if v == METHOD_VERSION:
            print(f"{OK} _analysis.json present, chaos method {v} — would be SERVED from disk")
        else:
            print(f"{WARN} _analysis.json present, chaos method {v!r} != {METHOD_VERSION} "
                  f"— would be RECOMPUTED and rewritten")

    # ── 4. the actual call ───────────────────────────────────────────────────
    if not analyse:
        print(f"\n  (probe only — pass --analyse to run /analysis and time it)\n")
        return 0 if not missing and "laps" not in empty else 1

    print(f"\n  calling /analysis/{session_key}{'?force_refresh=true' if force else ''} …")
    from fastapi.testclient import TestClient
    from app.main import app

    t0 = time.time()
    with TestClient(app, raise_server_exceptions=False) as client:
        url = f"/analysis/{session_key}" + ("?force_refresh=true" if force else "")
        resp = client.get(url)
    took = time.time() - t0

    if resp.status_code != 200:
        body = resp.json()
        err = body.get("error", body)
        print(f"{BAD} HTTP {resp.status_code} in {took:.1f}s — {err.get('code')}: {err.get('message')}")
        if err.get("details"):
            print(f"{DIM} details: {json.dumps(err['details'], default=str)}")
        if err.get("code") == "SESSION_NOT_HISTORICAL_YET":
            print(f"{DIM} this is the gate, not a data problem — rerun with --force")
        return 1

    a = resp.json()
    print(f"{OK} HTTP 200 in {took:.1f}s")
    ch = a["chaos"]
    print(f"{DIM} chaos {ch['score']}/{ch['level']} (method {ch['method_version']}), "
          f"peak L{ch['peak_chaos_lap']}")
    print(f"{DIM} {len(a['true_pace'])} drivers · {len(a['tyre_degradation'])} stints · "
          f"{len(a['pit_impact'])} stops · {len(a.get('pit_cycles', []))} pit cycles · "
          f"{len(a['engineer_notes'])} notes")
    cls = a.get("race_classification") or []
    winner = next((r for r in cls if r.get("finishing_position") == 1), None)
    print(f"{DIM} classification: {len(cls)} rows"
          + (f", winner {winner['driver_code']} from P{winner.get('grid_position')}" if winner else " (no P1 resolved)"))

    mods = a.get("modules") or {}
    bad = {k: v for k, v in mods.items() if v.get("status") == "failed"}
    na = {k: v for k, v in mods.items() if v.get("status") == "not_applicable"}
    print(f"{OK if not bad else BAD} modules: {sum(1 for v in mods.values() if v['status'] == 'ok')} ok, "
          f"{len(na)} not_applicable, {len(bad)} failed")
    for k, v in na.items():
        print(f"{DIM}   {k}: {v.get('reason')}")
    for k, v in bad.items():
        print(f"{BAD}   {k}: {v.get('reason')}")

    tr = a.get("team_radio")
    print(f"{DIM} team_radio: " + (f"{tr['total']} clips ({tr['in_race']} in race)" if tr else "none"))
    print()
    return 1 if bad else 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Check whether /analysis can serve a session yet.")
    ap.add_argument("session_key", type=int)
    ap.add_argument("--analyse", action="store_true", help="actually call /analysis (writes this session's cache)")
    ap.add_argument("--force", action="store_true", help="force_refresh=true: bypass the historical gate")
    ap.add_argument("--cache-dir", metavar="DIR",
                    help="write this run's cache somewhere else (backend/cache/ is versioned)")
    args = ap.parse_args()
    if args.cache_dir:
        settings.cache_dir = args.cache_dir
        print(f"cache redirected to {args.cache_dir} — backend/cache/ untouched")
    return asyncio.run(probe(args.session_key, args.analyse, args.force))


if __name__ == "__main__":
    sys.exit(main())
