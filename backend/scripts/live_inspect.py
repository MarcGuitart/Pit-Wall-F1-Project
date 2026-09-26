"""
Inspect what live_recorder.py captured. Read-only; run it after the session.

    python scripts/live_inspect.py live/2026-09-26_race
    python scripts/live_inspect.py live/... --gap-factor 8 --json report.json

Per topic: messages, rate, first/last timestamp, gaps, and how many documents
(_key) were updated more than once. Gaps are reported two ways, because they
mean different things:

- _id gaps: the broker's _id is a single ever-increasing counter across ALL
  topics, including the ones this recorder did not subscribe to. With
  car_data and location off, most of the counter is consumed by messages we
  never asked for, so a large "not in this capture" number is expected and is
  NOT loss. Use it only relatively: a sudden concentration of absent ids in
  the seconds around a cut or an unexpected disconnect is the signature of a
  real hole, which is why the cuts are printed next to it.
- time gaps: a silence longer than `--gap-factor` times the topic's median
  interval. Flags stoppages as well as losses, so read it next to the events.
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


def iso(t: float) -> str:
    return datetime.fromtimestamp(t, timezone.utc).strftime("%H:%M:%S")


def read_jsonl(path: Path):
    """Yield (line_number, object); report unparsable lines rather than dying."""
    bad = 0
    with path.open(encoding="utf-8") as fh:
        for n, line in enumerate(fh, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                yield n, json.loads(line)
            except json.JSONDecodeError:
                bad += 1
    if bad:
        print(f"  ! {path.name}: {bad} unparsable line(s) — likely a truncated tail")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("dir", help="directory written by live_recorder.py")
    ap.add_argument("--gap-factor", type=float, default=10.0,
                    help="a time gap is >= this many times the topic's median interval (default 10)")
    ap.add_argument("--min-gap", type=float, default=5.0, help="ignore time gaps shorter than this (s)")
    ap.add_argument("--json", metavar="FILE", help="also write the report as JSON")
    args = ap.parse_args()

    root = Path(args.dir)
    if not root.is_dir():
        print(f"not a directory: {root}")
        return 2

    files = sorted(p for p in root.glob("*.jsonl") if not p.name.startswith("_"))
    if not files:
        print(f"no topic files in {root}")
        return 2

    # ── recorder events: the ground truth for deliberate cuts ────────────────
    cuts: list[dict] = []
    ev_path = root / "_events.jsonl"
    events = [o for _, o in read_jsonl(ev_path)] if ev_path.exists() else []
    for e in events:
        if e.get("gap_s") is not None and e.get("kind", "").startswith("CUT"):
            cuts.append({"at": e["_ts"], "iso": e.get("_iso"), "gap_s": e["gap_s"]})
    renewals = sum(1 for e in events if e.get("kind") == "RENEW")
    bugs = [e for e in events if e.get("kind") == "BUG!"]
    unexpected_disc = [e for e in events if e.get("kind") == "DISCONN!"]

    all_ids: set[int] = set()
    per_topic_ids: dict[str, list[int]] = {}
    report: dict = {"dir": str(root), "topics": {}, "events": {
        "renewals": renewals, "callback_bugs": len(bugs),
        "unexpected_disconnects": len(unexpected_disc),
        "deliberate_cuts": cuts,
    }}

    rows = []
    for path in files:
        topic = path.stem
        recv: list[float] = []
        ids: list[int] = []
        keys = Counter()
        key_first_last: dict[str, tuple[float, float]] = {}
        unparsed = 0
        for _, obj in read_jsonl(path):
            t = obj.get("_recv")
            msg = obj.get("msg") or {}
            if t is not None:
                recv.append(float(t))
            if isinstance(msg, dict):
                if "_unparsed" in msg:
                    unparsed += 1
                if isinstance(msg.get("_id"), int):
                    ids.append(msg["_id"])
                k = msg.get("_key")
                if isinstance(k, str):
                    keys[k] += 1
                    if t is not None:
                        f, l = key_first_last.get(k, (t, t))
                        key_first_last[k] = (min(f, t), max(l, t))
        if not recv:
            rows.append((topic, 0, "-", "-", "-", 0, 0, 0))
            report["topics"][topic] = {"messages": 0}
            continue

        recv.sort()
        span = recv[-1] - recv[0]
        deltas = [b - a for a, b in zip(recv, recv[1:])]
        median_dt = statistics.median(deltas) if deltas else 0.0
        threshold = max(args.min_gap, median_dt * args.gap_factor) if median_dt else args.min_gap
        time_gaps = [
            {"after": recv[i], "iso": iso(recv[i]), "seconds": round(d, 1)}
            for i, d in enumerate(deltas) if d >= threshold
        ]
        repeated = {k: c for k, c in keys.items() if c > 1}
        rate = len(recv) / span if span > 0 else 0.0

        all_ids.update(ids)
        per_topic_ids[topic] = ids

        rows.append((topic, len(recv), iso(recv[0]), iso(recv[-1]),
                     f"{rate:.2f}/s" if rate >= 0.01 else f"{rate * 60:.1f}/min",
                     len(time_gaps), len(repeated), unparsed))
        report["topics"][topic] = {
            "messages": len(recv),
            "first": recv[0], "last": recv[-1], "span_s": round(span, 1),
            "rate_per_s": round(rate, 4),
            "median_interval_s": round(median_dt, 3),
            "gap_threshold_s": round(threshold, 1),
            "time_gaps": time_gaps,
            "distinct_keys": len(keys),
            "keys_updated_more_than_once": len(repeated),
            "max_updates_for_one_key": max(keys.values()) if keys else 0,
            "top_repeated_keys": dict(Counter(repeated).most_common(5)),
            "unparsed_payloads": unparsed,
            "id_min": min(ids) if ids else None, "id_max": max(ids) if ids else None,
        }

    # ── _id continuity across the whole capture ──────────────────────────────
    missing: list[int] = []
    if all_ids:
        lo, hi = min(all_ids), max(all_ids)
        missing = [i for i in range(lo, hi + 1) if i not in all_ids]
        report["ids"] = {
            "min": lo, "max": hi, "seen": len(all_ids),
            "counter_span": hi - lo + 1,
            "not_in_this_capture": len(missing),
            "coverage_pct": round(100 * len(all_ids) / (hi - lo + 1), 2),
            "note": "ids are global across all topics, including unsubscribed ones "
                    "(car_data/location); a low coverage is expected, not loss",
        }

    # ── output ───────────────────────────────────────────────────────────────
    w = max((len(r[0]) for r in rows), default=8)
    print(f"\n{root}\n")
    print(f"{'topic':<{w}} {'msgs':>7} {'first':>9} {'last':>9} {'rate':>10} {'tgaps':>6} {'keys>1':>7} {'unparsed':>9}")
    print("-" * (w + 62))
    for t, n, f, l, rate, g, k, u in sorted(rows, key=lambda r: -r[1]):
        print(f"{t:<{w}} {n:>7} {f:>9} {l:>9} {rate:>10} {g:>6} {k:>7} {u:>9}")
    total = sum(r[1] for r in rows)
    print("-" * (w + 62))
    print(f"{'TOTAL':<{w}} {total:>7}")

    if "ids" in report:
        d = report["ids"]
        print(f"\n_id counter: captured {d['seen']} ids spanning [{d['min']}…{d['max']}] "
              f"({d['coverage_pct']}% of the counter)")
        print("  the counter is global across ALL topics, including the ones not subscribed")
        print("  (car_data/location) — low coverage is expected and is not data loss.")
        print("  Real loss shows up as absent ids bunched around a cut or a disconnect, below.")

    print(f"\nrecorder events: {renewals} token renewal(s) · {len(unexpected_disc)} unexpected disconnect(s) · "
          f"{len(bugs)} callback bug(s)")
    for c in cuts:
        print(f"  cut at {c['iso']} — gap {c['gap_s']}s")
    for b in bugs:
        print(f"  BUG in {b.get('callback')}: {b.get('message')}")

    gaps_all = [(t, g) for t, d in report["topics"].items() for g in d.get("time_gaps", [])]
    if gaps_all:
        print(f"\ntime gaps (>= {args.gap_factor}x the topic median, min {args.min_gap}s):")
        for t, g in sorted(gaps_all, key=lambda x: -x[1]["seconds"])[:15]:
            near = any(abs(g["after"] - c["at"]) < 30 for c in cuts)
            print(f"  {t:<16} {g['iso']} for {g['seconds']:>7.1f}s" + ("   (within 30s of a token cut)" if near else ""))

    if args.json:
        Path(args.json).write_text(json.dumps(report, indent=1, default=str), encoding="utf-8")
        print(f"\nJSON report: {args.json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
