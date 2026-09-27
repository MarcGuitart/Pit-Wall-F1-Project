"""
Turn a computed analysis into a readable Markdown race report.

    python scripts/postrace_report.py 11369
    python scripts/postrace_report.py 11369 --cache-dir /tmp/rcache --out report.md

Read-only: it reads the cached _analysis.json for that session and writes a .md
file. It computes nothing new — every number comes straight from the analysis,
including the chaos weights and thresholds, so the report cannot disagree with
the API. It selects, orders and phrases; it does not recalculate.

It publishes nothing. Review the file and decide.
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, ".")

from app.core import cache  # noqa: E402
from app.core.config import settings  # noqa: E402

# Human labels for the chaos components — the values stay exactly as computed.
COMPONENT_LABEL = {
    "safety_car": "Safety Car / VSC",
    "yellow_flags": "Yellow flags",
    "stewarding": "Incidents and penalties",
    "weather": "Wet running",
    "position_volatility": "On-track position changes",
}


def laptime(seconds: float | None) -> str:
    """97.985 -> 1:37.985"""
    if seconds is None:
        return "—"
    m, s = divmod(float(seconds), 60)
    return f"{int(m)}:{s:06.3f}" if m else f"{s:.3f}s"


def signed(n: int | None) -> str:
    return "—" if n is None else (f"+{n}" if n > 0 else str(n))


def pct(x: float) -> str:
    return f"{round(x * 100)}%"


def build(a: dict) -> str:
    race = a["race"]
    brain = a["race_brain"]
    chaos = a["chaos"]
    L: list[str] = []

    title = f"{race['meeting_name']} {race['year']} — {race['session_name']}"
    circuit = race.get("circuit_short_name") or race.get("country_name") or ""
    L += [f"# {title}", ""]
    if circuit:
        L += [f"*{circuit} · analysis generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')} UTC*", ""]

    # ── the one-paragraph verdict ────────────────────────────────────────────
    L += [f"**{brain['race_phase']}** · Chaos {chaos['score']}/100 ({chaos['level']}) · "
          f"strategic tension {brain['strategic_tension']}", ""]
    L += [f"> {brain['main_question']}", ""]

    dna = a.get("race_dna")
    if dna:
        L += [f"What decided it: **{dna['primary_factor']}**, then {dna['secondary_factor']}. "
              f"Overtaking difficulty {dna['overtaking_difficulty'].lower()}, "
              f"pit timing sensitivity {dna['pit_timing_sensitivity'].lower()}.", ""]

    # ── result ───────────────────────────────────────────────────────────────
    cls = [r for r in (a.get("race_classification") or []) if r.get("finishing_position")]
    cls.sort(key=lambda r: r["finishing_position"])
    if cls:
        L += ["## Result", "", "| Pos | Driver | Grid | Gained |", "|---:|---|---:|---:|"]
        for r in cls[:10]:
            L.append(f"| {r['finishing_position']} | **{r['driver_code']}** | "
                     f"{r.get('grid_position') or '—'} | {signed(r.get('positions_gained'))} |")
        L.append("")
        movers = sorted((r for r in cls if r.get("positions_gained") is not None),
                        key=lambda r: -(r["positions_gained"] or 0))
        if movers and (movers[0].get("positions_gained") or 0) > 0:
            top = movers[0]
            L += [f"Biggest gain: **{top['driver_code']}**, {signed(top['positions_gained'])} "
                  f"(P{top.get('grid_position')} → P{top['finishing_position']}).", ""]

    # ── True Pace ────────────────────────────────────────────────────────────
    pace = sorted(a.get("true_pace") or [], key=lambda r: r["rank"])
    if pace:
        L += ["## True Pace", "",
              "Median clean-lap pace with pit laps, safety-car laps and outliers removed. "
              "This is not the finishing order: it is who was quickest when the track was theirs.", "",
              "| # | Driver | Median clean lap | Best clean lap | Clean laps | Confidence |",
              "|---:|---|---|---|---:|---|"]
        for r in pace[:10]:
            L.append(f"| {r['rank']} | **{r['driver_code']}** | {laptime(r.get('median_clean_lap'))} | "
                     f"{laptime(r.get('fastest_clean_lap'))} | {r.get('sample_size', '—')} | "
                     f"{r.get('confidence', '—')} |")
        L.append("")
        best = pace[0]
        fin = best.get("finishing_position")
        if fin and fin != 1:
            L += [f"The quickest car over the race was **{best['driver_code']}**, who finished P{fin}"
                  + (f" from P{best['grid_position']}" if best.get("grid_position") else "") + ".", ""]

    # ── Chaos ────────────────────────────────────────────────────────────────
    L += ["## Chaos Index", "", f"**{chaos['score']}/100 — {chaos['level']}**", ""]
    L += [chaos["summary"], ""]
    breakdown = chaos.get("breakdown") or {}
    if breakdown:
        ranked = sorted(breakdown.items(), key=lambda kv: -kv[1]["points"])
        lead, lead_v = ranked[0]
        L += [f"What drove it: **{COMPONENT_LABEL.get(lead, lead)}**, "
              f"{lead_v['points']:.0f} of its {lead_v['weight']} points "
              f"({pct(lead_v['normalized'])} of the scale). {lead_v.get('note', '')}".strip(), ""]
        L += ["| Component | Points | Of max | Measured |", "|---|---:|---:|---|"]
        for name, v in ranked:
            L.append(f"| {COMPONENT_LABEL.get(name, name)} | {v['points']:.0f} | {v['weight']} | "
                     f"{pct(v['normalized'])} of the scale |")
        L.append("")
    if chaos.get("peak_chaos_lap"):
        L += [f"Busiest lap of the race: **lap {chaos['peak_chaos_lap']}**.", ""]

    # ── pit cycles ───────────────────────────────────────────────────────────
    cycles = a.get("pit_cycles") or []
    decisive = sorted(cycles, key=lambda c: -c.get("stops", 0))[:3]
    if decisive:
        L += ["## Pit windows that mattered", "",
              "Stops are read as a group: a driver's position moves because the cars around "
              "him stopped, so each window is measured once it has closed.", ""]
        for c in decisive:
            parts = c.get("participants") or []
            gained = sorted((p for p in parts if p.get("delta", 0) > 0), key=lambda p: -p["delta"])[:3]
            lost = sorted((p for p in parts if p.get("delta", 0) < 0), key=lambda p: p["delta"])[:3]
            L.append(f"**Laps {c['lap_start']}–{c['lap_end']}** — {c['stops']} stop"
                     f"{'s' if c['stops'] != 1 else ''}, read at lap {c['close_lap']}"
                     + ("  ⚠️ safety car inside this window, so the gains are not timing alone" if c.get("neutralised") else ""))
            if gained:
                L.append(f"- Gained: " + ", ".join(f"{p['driver_code']} {signed(p['delta'])}" for p in gained))
            if lost:
                L.append(f"- Lost: " + ", ".join(f"{p['driver_code']} {signed(p['delta'])}" for p in lost))
            uc = c.get("undercuts") or []
            if uc:
                L.append("- Undercuts: " + ", ".join(f"{u['attacker']} over {u['target']}" for u in uc[:4]))
            L.append("")

    # ── decisions ────────────────────────────────────────────────────────────
    decisions = sorted(a.get("decisions") or [], key=lambda d: d["rank"])
    if decisions:
        L += ["## The decisions that shaped the race", ""]
        for d in decisions:
            lap = f" (lap {d['lap_number']})" if d.get("lap_number") else ""
            L += [f"**{d['rank']}. {d['title']}**{lap} — {d['impact']}", ""]
            explanation = d.get("explanation") or ""
            # The chaos decision restates the chaos summary verbatim, which is
            # already a section of its own; do not print it twice.
            if explanation.strip() and explanation.strip() != (chaos.get("summary") or "").strip():
                L += [explanation, ""]
            else:
                L += ["See the Chaos Index section above.", ""]

    # ── supporting detail ────────────────────────────────────────────────────
    extra: list[str] = []
    wx = a.get("weather_analysis")
    if wx:
        extra.append(f"- **Conditions**: {wx['summary']}")
    cliffs = [r for r in (a.get("tyre_degradation") or []) if r.get("cliff_risk") == "High"]
    if cliffs:
        worst = max(cliffs, key=lambda r: r.get("degradation_slope") or 0)
        extra.append(f"- **Tyre life**: {len(cliffs)} stints hit high cliff risk. Steepest was "
                     f"{worst['driver_code']} on {worst['compound']} "
                     f"(laps {worst['lap_start']}–{worst['lap_end']}, "
                     f"+{worst['degradation_slope']:.3f}s per lap, {worst.get('confidence', '—')} confidence).")
    if brain.get("best_compound"):
        extra.append(f"- **Best compound overall**: {brain['best_compound']}.")
    drs = (a.get("drs_trains") or {}).get("peak_train")
    if drs:
        extra.append(f"- **Worst train**: {drs['leader']} led {drs['peak_length']} cars for "
                     f"{drs['duration_seconds']}s (laps {drs['lap_start']}–{drs['lap_end']}), "
                     f"average gap {drs['average_gap']}s.")
    cav = a.get("clean_air_value") or {}
    if cav.get("estimated_gain") is not None:
        extra.append(f"- **Cost of traffic**: about {cav['estimated_gain']}s per lap in clean air "
                     f"({cav['confidence']} confidence — an estimate, not a measurement).")
    radio = a.get("team_radio")
    if radio:
        extra.append(f"- **Team radio**: {radio['total']} clips published, {radio['in_race']} during the race.")
    if extra:
        L += ["## Supporting detail", ""] + extra + [""]

    # ── transparency: never hide a module that did not run ───────────────────
    mods = a.get("modules") or {}
    failed = {k: v for k, v in mods.items() if v.get("status") == "failed"}
    na = {k: v for k, v in mods.items() if v.get("status") == "not_applicable"}
    L += ["## What this analysis does not cover", ""]
    if not failed and not na:
        L += ["Every module produced a result for this session.", ""]
    else:
        if na:
            L.append("Not applicable to this race:")
            for k, v in sorted(na.items()):
                L.append(f"- *{k.replace('_', ' ')}*: {v.get('reason')}")
            L.append("")
        if failed:
            L.append("**Failed to compute** (a defect, not a property of the race):")
            for k, v in sorted(failed.items()):
                L.append(f"- *{k.replace('_', ' ')}*: {v.get('reason')}")
            L.append("")

    L += ["---", "",
          f"Chaos Index method {chaos.get('method_version', '?')}. "
          f"Data from OpenF1. Unofficial project, not associated in any way with the "
          f"Formula 1 companies.", ""]
    return "\n".join(L)


def main() -> int:
    ap = argparse.ArgumentParser(description="Render a Markdown race report from a computed analysis.")
    ap.add_argument("session_key", type=int)
    ap.add_argument("--cache-dir", metavar="DIR", help="read the analysis from here instead of backend/cache")
    ap.add_argument("--out", metavar="FILE", help="output path (default reports/<key>_<circuit>.md)")
    args = ap.parse_args()

    if args.cache_dir:
        settings.cache_dir = args.cache_dir

    a = cache.get_full_analysis(args.session_key)
    if a is None:
        print(f"no analysis cached for {args.session_key} in {settings.cache_path}")
        print("run:  python scripts/postrace_check.py {key} --analyse   first")
        return 2

    md = build(a)
    circuit = (a["race"].get("circuit_short_name") or "session").lower().replace(" ", "-")
    out = Path(args.out) if args.out else Path("reports") / f"{args.session_key}_{circuit}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(md, encoding="utf-8")
    print(f"written: {out}  ({len(md.splitlines())} lines, {len(md)} chars)")
    print("nothing published — review it and decide.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
