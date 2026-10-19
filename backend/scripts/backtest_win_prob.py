"""
Backtest the live win probability lap by lap, against "the leader wins".

    cd backend
    python scripts/backtest_win_prob.py                         # every race with lap-by-lap data
    python scripts/backtest_win_prob.py --capture ~/.pitwall-ui-tools/baku
    python scripts/backtest_win_prob.py --races 11731,9636 --json /tmp/out.json

Block 35. It measures the predictor that ships (scripts/live_projection.py,
race_projection) as it is; it does not change it. Offline only: it reads
backend/cache and, optionally, a recorder capture, and never calls OpenF1.
It writes nothing unless --json is given.

Where the laps come from, best first:

  capture   a recorder capture (--capture DIR), replayed message by message
            through RaceState.ingest — exactly what the live server saw.
  rest      cache/<key>/{laps,intervals,position}.json, replayed through
            live_state.replay — the REST data in the order MQTT would send it.
  charts    cache/<key>/_lap_charts.json, the published lap charts: lap times,
            pit laps, stints and SC bands per driver. The order and the gaps
            are rebuilt from summed lap times (exact at the line when no lap
            time is missing; a missing one is filled with the field's median
            for that lap). The stints are the feed's, cut at the lap — no
            stint that starts later is visible, so nothing leaks from the
            future. What this cannot rebuild: the pit-lane times (the model
            then uses its 22 s default) and intervals between laps.

At every lap the leader starts (current_lap = 3 … total), the projection is
run as the live server runs it, and scored against the classified winner.

  baseline  "the leader wins with p(gap, laps)": P(leader) = Φ(gap / (σ·√n)),
            gap to P2 in seconds, n laps left, σ the per-lap spread of the
            P1–P2 lap-time difference measured so far in this race (clean
            laps, last 20; 0.8 s until there are four). The rest goes to P2.
            With no laps left, the leader gets 1. Nothing is fitted to results.
  brier     Σ over the field (p − won)²; 0 is perfect, 2 is certain and wrong
  log loss  −ln p(actual winner), p floored at EPS so one miss is finite
  top       the favourite won
  ECE       expected calibration error over every (driver, p) in the bucket
  severe    the eventual winner leads with ≤ 3 laps left and gets under 50 %
            (and the subset where it leads by 5 s or more)
"""
from __future__ import annotations

import argparse
import json
import math
import random
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import live_projection as lp  # noqa: E402
from live_state import RaceState, load_capture, replay  # noqa: E402

EPS = 0.005
BUCKETS = ((0, 2, "0–2"), (3, 5, "3–5"), (6, 10, "6–10"), (11, 20, "11–20"), (21, 10_000, "21+"))
CAL_BINS = (0.0, 0.05, 0.2, 0.4, 0.6, 0.8, 0.95, 1.0000001)
SIGMA_DEFAULT, SIGMA_RANGE = 0.8, (0.3, 2.0)


# ── the states, lap by lap ───────────────────────────────────────────────────

def state_from_lap_charts(charts: dict, lap: int) -> RaceState:
    """The live state on ``lap`` (the lap the leader is on), from _lap_charts.json."""
    s = RaceState(session_key=charts.get("session_key"))
    total = charts["total_laps"]
    s.race_distance = total
    s.current_lap = lap
    for b in charts.get("bands") or []:
        s.flag_laps.update(range(b["from"], min(b["to"], lap) + 1))
    done = lap - 1                                  # laps completed by the leader
    field: dict[int, list[float]] = {}
    for d in charts["drivers"]:
        for ln, t, *_ in d["laps"]:
            if ln <= done:
                field.setdefault(ln, []).append(t)
    med = {ln: statistics.median(ts) for ln, ts in field.items()}
    race_time: dict[int, tuple[int, float]] = {}
    for d in charts["drivers"]:
        dn = d["number"]
        laps = {ln: t for ln, t, *_ in d["laps"] if ln <= done}
        last = max((ln for ln, *_ in d["laps"]), default=0)
        if last < done and last < total:            # out of the race before this point
            continue
        s.drivers[dn] = {"code": d["code"], "colour": d.get("colour")}
        s.lap_times[dn].update(laps)
        s.pit_laps[dn] = [ln for ln, _t, _out, pit_in in d["laps"] if pit_in and ln <= done]
        for st in d.get("stints") or []:
            if (st.get("lap_start") or 1) <= lap:
                s.stints[dn][st["stint_number"]] = {**st, "lap_end": min(st.get("lap_end") or lap, lap)}
        upto = min(done, last)
        race_time[dn] = (upto, sum(laps.get(k, med.get(k, 0.0)) for k in range(1, upto + 1)))
    if not race_time:
        return s
    order = sorted(race_time, key=lambda dn: (-race_time[dn][0], race_time[dn][1]))
    lead_laps, lead_t = race_time[order[0]]
    for i, dn in enumerate(order):
        s.position[dn] = i + 1
        down = lead_laps - race_time[dn][0]
        s.gap[dn] = {"gap_to_leader": 0.0 if i == 0 else f"+{down} LAP" if down else
                     round(race_time[dn][1] - lead_t, 3)}
    return s


def _sampled(state: RaceState, feed, on_lap) -> None:
    """Run ``feed`` (a replay into ``state``) and call on_lap(state) each time
    the leader starts a new lap — the state live_state.replay(until_lap=L)
    stops at, for every L, in one pass."""
    orig = state.ingest

    def ingest(*a, **kw):
        before = state.current_lap
        out = orig(*a, **kw)
        if state.current_lap > before and not state.chequered:
            on_lap(state)
        return out

    state.ingest = ingest
    try:
        feed()
    finally:
        state.ingest = orig


# ── the sessions ─────────────────────────────────────────────────────────────

def _meta(d: Path) -> dict:
    try:
        return json.loads((d / "_session_meta.json").read_text())
    except (OSError, json.JSONDecodeError):
        return {}


def _winner_from_positions(d: Path) -> int | None:
    pos = json.loads((d / "position.json").read_text())
    last: dict[int, tuple[str, int]] = {}
    for m in pos:
        dn, p, at = m.get("driver_number"), m.get("position"), m.get("date") or ""
        if isinstance(dn, int) and isinstance(p, int) and (dn not in last or at >= last[dn][0]):
            last[dn] = (at, p)
    first = [dn for dn, (_, p) in last.items() if p == 1]
    return first[0] if len(first) == 1 else None


def _winner(d: Path, charts: dict | None) -> tuple[int | None, str]:
    a = d / "_analysis.json"
    if a.exists():
        rows = json.loads(a.read_text()).get("race_classification") or []
        for r in rows:
            if r.get("finishing_position") == 1:
                return r["driver_number"], "classification"
    if charts and charts.get("winner"):
        for drv in charts["drivers"]:
            if drv["code"] == charts["winner"]:
                return drv["number"], "lap charts"
    if (d / "position.json").exists():
        return _winner_from_positions(d), "final position feed"
    return None, "none"


def sessions(cache: Path, only: set[int] | None, capture: Path | None) -> tuple[list[dict], list[dict]]:
    """Every race/sprint that can be replayed, and every one that cannot, with why."""
    usable, skipped = [], []
    cap_key = None
    if capture:
        first = next((m for _, _, m in load_capture(capture) if m.get("session_key")), None)
        cap_key = first and first["session_key"]
    for d in sorted(p for p in cache.iterdir() if p.is_dir() and p.name.isdigit()):
        key = int(d.name)
        if only and key not in only:
            continue
        meta = _meta(d)
        stype = meta.get("session_type")
        label = f"{meta.get('year', '?')} {meta.get('location') or meta.get('circuit_short_name') or '?'} {meta.get('session_name') or ''}".strip()
        charts = json.loads((d / "_lap_charts.json").read_text()) if (d / "_lap_charts.json").exists() else None
        raw = all((d / f).exists() for f in ("laps.json", "intervals.json", "position.json"))
        if stype not in (None, "Race"):
            continue                                       # practice / qualifying: no winner to score
        if stype is None and not raw:
            skipped.append({"key": key, "label": label, "why": "no session metadata and no raw laps/intervals/position"})
            continue
        if stype is None:
            label = f"session {key} (no metadata; a race by its laps and chequered flag)"
        winner, wsrc = _winner(d, charts)
        if winner is None:
            skipped.append({"key": key, "label": label, "why": "no winner: no classification, lap charts or position feed"})
            continue
        if capture and key == cap_key:
            src = "capture"
        elif raw:
            src = "rest"
        elif charts:
            src = "charts"
        else:
            why = ("only _analysis.json is published — no lap times, gaps or stints per lap"
                   if (d / "_analysis.json").exists() else "no lap data")
            skipped.append({"key": key, "label": label, "why": why})
            continue
        if src == "rest":
            total = max(m.get("lap_number") or 0 for m in json.loads((d / "laps.json").read_text()))
        else:
            total = charts["total_laps"] if charts else None
        usable.append({"key": key, "label": label, "source": src, "winner": winner,
                       "winner_source": wsrc, "total": total, "charts": charts, "dir": d})
    if capture and cap_key is not None and not any(u["key"] == cap_key for u in usable):
        skipped.append({"key": cap_key, "label": str(capture), "why": "capture given but its session has no winner in the cache"})
    return usable, skipped


# ── scoring ──────────────────────────────────────────────────────────────────

def _sigma(st: RaceState, a: int, b: int) -> float:
    neutral = set(st.flag_laps)
    pits = set(st.pit_laps.get(a, [])) | set(st.pit_laps.get(b, []))
    excl = neutral | pits | {p + 1 for p in pits} | {1}
    la, lb = st.lap_times.get(a) or {}, st.lap_times.get(b) or {}
    diffs = [la[k] - lb[k] for k in sorted(set(la) & set(lb)) if k not in excl][-20:]
    if len(diffs) < 4:
        return SIGMA_DEFAULT
    sd = statistics.pstdev(diffs)
    return min(max(sd, SIGMA_RANGE[0]), SIGMA_RANGE[1])


def baseline(st: RaceState) -> tuple[dict[int, float], float | None]:
    """P(leader) = Φ(gap / (σ√n)); the rest to P2. Returns (probs, gap to P2)."""
    order = sorted(st.position, key=st.position.get)
    if not order:
        return {}, None
    leader = order[0]
    if len(order) == 1:
        return {leader: 1.0}, None
    p2 = order[1]
    gap = (st.gap.get(p2) or {}).get("gap_to_leader")
    left = max(0, (st.race_distance or 0) - st.current_lap)
    if not isinstance(gap, (int, float)):
        p = 1.0                                         # P2 a lap down (or unknown): the leader
    elif left == 0:
        p = 1.0
    else:
        z = max(float(gap), 0.0) / (_sigma(st, leader, p2) * math.sqrt(left))
        p = 0.5 * (1 + math.erf(z / math.sqrt(2)))
    return {leader: p, p2: 1 - p}, (float(gap) if isinstance(gap, (int, float)) else None)


def score_state(st: RaceState, sess: dict) -> dict:
    lap = st.current_lap
    proj = lp.race_projection(st, rng=random.Random(sess["key"] * 100 + lap))
    base, gap2 = baseline(st)
    model = {d["driver_number"]: d["win"] for d in proj["drivers"]}
    leader = min(st.position, key=st.position.get) if st.position else None
    return {"key": sess["key"], "lap": lap, "left": max(0, (st.race_distance or 0) - lap),
            "model": model, "base": base, "winner": sess["winner"], "leader": leader,
            "gap2": gap2, "reason": proj.get("reason")}


def rows_for(sess: dict, capture: Path | None) -> list[dict]:
    """The scored state at every lap of one session."""
    if sess["source"] == "charts":
        return [score_state(state_from_lap_charts(sess["charts"], lap), sess)
                for lap in range(lp.MIN_LAPS_FOR_RACE, sess["total"] + 1)]
    s = RaceState(session_key=sess["key"])
    s.race_distance = sess["total"]
    rows: list[dict] = []

    def on_lap(st: RaceState) -> None:
        if st.current_lap >= lp.MIN_LAPS_FOR_RACE:
            rows.append(score_state(st, sess))

    if sess["source"] == "rest":
        _sampled(s, lambda: replay(sess["key"], s), on_lap)       # replay reads ./cache
    else:
        from live_state import replay_capture
        _sampled(s, lambda: replay_capture(capture, s, speed=0), on_lap)
    return rows


def _metrics(r: dict, which: str) -> dict:
    p = r[which]
    w = r["winner"]
    field = set(r["model"]) | set(r["base"]) | {w}       # the same drivers for both
    fav = max(p, key=p.get) if p else None
    return {
        "brier": sum((p.get(dn, 0.0) - (dn == w)) ** 2 for dn in field),
        "logloss": -math.log(max(EPS, p.get(w, 0.0))),
        "top": fav == w,
        "pairs": [(p.get(dn, 0.0), dn == w) for dn in field],
    }


def _ece(pairs: list[tuple[float, bool]]) -> float:
    n = len(pairs)
    if not n:
        return float("nan")
    err = 0.0
    for lo, hi in zip(CAL_BINS, CAL_BINS[1:]):
        b = [(p, y) for p, y in pairs if lo <= p < hi]
        if b:
            err += len(b) / n * abs(statistics.fmean(p for p, _ in b) - statistics.fmean(y for _, y in b))
    return err


def _severe(r: dict) -> bool:
    """The eventual winner leads with three laps or fewer left and the model
    gives it under 50 %."""
    return r["leader"] == r["winner"] and r["left"] <= 3 and r["model"].get(r["leader"], 0.0) < 0.5


def summarise(rows: list[dict]) -> dict:
    scored = [r for r in rows if r["model"]]

    def block(rs: list[dict]) -> dict:
        if not rs:
            return {"n": 0}
        m = [_metrics(r, "model") for r in rs]
        b = [_metrics(r, "base") for r in rs]
        mean = lambda xs, k: statistics.fmean(x[k] for x in xs)  # noqa: E731
        return {
            "n": len(rs),
            "brier": mean(m, "brier"), "base_brier": mean(b, "brier"),
            "logloss": mean(m, "logloss"), "base_logloss": mean(b, "logloss"),
            "top": mean(m, "top"), "base_top": mean(b, "top"),
            "ece": _ece([pr for x in m for pr in x["pairs"]]),
            "base_ece": _ece([pr for x in b for pr in x["pairs"]]),
            "severe": sum(1 for r in rs if _severe(r)),
            "severe_5s": sum(1 for r in rs if _severe(r) and (r["gap2"] or 0) >= 5),
        }

    by_bucket = {label: block([r for r in scored if lo <= r["left"] <= hi]) for lo, hi, label in BUCKETS}
    reliability = []
    for which in ("model", "base"):
        pairs = [pr for r in scored for pr in _metrics(r, which)["pairs"]]
        for lo, hi in zip(CAL_BINS, CAL_BINS[1:]):
            b = [(p, y) for p, y in pairs if lo <= p < hi]
            reliability.append({"which": which, "bin": f"{lo:.2f}–{min(hi, 1):.2f}", "n": len(b),
                                "mean_p": statistics.fmean(p for p, _ in b) if b else None,
                                "won": statistics.fmean(y for _, y in b) if b else None})
    return {"all": block(scored), "buckets": by_bucket, "reliability": reliability,
            "unscored": len(rows) - len(scored)}


# ── output ───────────────────────────────────────────────────────────────────

def _f(x, nd=3):
    return "—" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{x:.{nd}f}"


def table(summary: dict) -> str:
    head = ("| vueltas restantes | n | Brier modelo | Brier base | log loss modelo | log loss base "
            "| acierto modelo | acierto base | ECE modelo | ECE base | graves | graves ≥5 s |\n"
            "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    lines = [head]
    for label, b in list(summary["buckets"].items()) + [("todas", summary["all"])]:
        if not b.get("n"):
            lines.append(f"| {label} | 0 | — | — | — | — | — | — | — | — | — | — |")
            continue
        lines.append(f"| {label} | {b['n']} | {_f(b['brier'])} | {_f(b['base_brier'])} | {_f(b['logloss'])} | "
                     f"{_f(b['base_logloss'])} | {b['top']:.0%} | {b['base_top']:.0%} | {_f(b['ece'])} | "
                     f"{_f(b['base_ece'])} | {b['severe']} | {b['severe_5s']} |")
    return "\n".join(lines)


def reliability_table(summary: dict) -> str:
    rows = {(r["which"], r["bin"]): r for r in summary["reliability"]}
    bins = [r["bin"] for r in summary["reliability"] if r["which"] == "model"]
    out = ["| p predicha | n modelo | p media modelo | ganó (modelo) | n base | p media base | ganó (base) |",
           "|---|---:|---:|---:|---:|---:|---:|"]
    for b in bins:
        m, s = rows[("model", b)], rows[("base", b)]
        out.append(f"| {b} | {m['n']} | {_f(m['mean_p'])} | {_f(m['won'])} | {s['n']} | {_f(s['mean_p'])} | {_f(s['won'])} |")
    return "\n".join(out)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--cache", default="cache", help="the backend cache (default: ./cache)")
    ap.add_argument("--capture", type=Path, help="a recorder capture to use for its session")
    ap.add_argument("--races", help="comma-separated session keys")
    ap.add_argument("--json", type=Path, help="also write every row and the summary here")
    args = ap.parse_args(argv)
    only = {int(k) for k in args.races.split(",")} if args.races else None
    usable, skipped = sessions(Path(args.cache), only, args.capture)

    all_rows, per_race = [], []
    for sess in usable:
        rows = rows_for(sess, args.capture)
        all_rows.extend(rows)
        s = summarise(rows)["all"]
        per_race.append((sess, s, rows))

    print("## Carreras\n")
    print("| sesión | carrera | fuente | ganador (fuente) | vueltas puntuadas | log loss modelo | log loss base | graves |")
    print("|---|---|---|---|---:|---:|---:|---:|")
    for sess, s, rows in per_race:
        print(f"| {sess['key']} | {sess['label']} | {sess['source']} | {sess['winner']} ({sess['winner_source']}) | "
              f"{s.get('n', 0)} | {_f(s.get('logloss'))} | {_f(s.get('base_logloss'))} | {s.get('severe', 0)} |")
    if skipped:
        print("\nNo backtestables:\n")
        for k in skipped:
            print(f"- {k['key']} {k['label']}: {k['why']}")
    summary = summarise(all_rows)
    print("\n## Por vueltas restantes\n")
    print(table(summary))
    print(f"\n(sin probabilidad del modelo en {summary['unscored']} vueltas: excluidas de ambos)")
    print("\n## Calibración (todas las vueltas)\n")
    print(reliability_table(summary))
    if args.json:
        args.json.write_text(json.dumps({"summary": summary, "skipped": skipped,
                                         "rows": [{k: v for k, v in r.items()} for r in all_rows]},
                                        default=str, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
