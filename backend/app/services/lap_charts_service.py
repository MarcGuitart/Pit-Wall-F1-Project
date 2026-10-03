"""
Lap-by-lap chart data for a finished race: every driver's lap times, stints and
pit laps, the neutralised periods, and the finishing order.

Deliberately raw. The four charts built on it (lap-time evolution, gap to a
reference, tyre degradation, fuel model) are computed in the browser by
frontend/lib/lapCharts.ts — the same functions the live page runs on the SSE
snapshot — so a race reads the same during and after it. This module only
assembles the input, in the shape lapCharts.ts expects.
"""
from __future__ import annotations

import re
from typing import Any

from app.utils.time import parse_utc

LAP_CHARTS_VERSION = 1

_SC_DEPLOYED = re.compile(r"\bSAFETY CAR DEPLOYED\b")
_VSC_DEPLOYED = re.compile(r"\bVIRTUAL SAFETY CAR DEPLOYED\b")
_SC_IN = re.compile(r"\bSAFETY CAR IN THIS LAP\b")
_VSC_ENDING = re.compile(r"\bVIRTUAL SAFETY CAR ENDING\b")
_RED = re.compile(r"\bRED FLAG\b")
_RESUME = re.compile(r"\b(GREEN LIGHT|TRACK CLEAR|RESUME)\b")


def _sort_key(m: dict) -> Any:
    d = m.get("date")
    try:
        return parse_utc(d) if isinstance(d, str) else None
    except Exception:
        return None


def neutralised_bands(race_control: list[dict], total_laps: int) -> list[dict]:
    """
    SC / VSC / red-flag periods as lap ranges, from race control alone.

    A period opens on its deployment message and closes on the lap its ending
    message names; one still open at the end of the data runs to the last lap.
    "CHEQUERED FLAG" contains "RED FLAG" as a substring — the word-bounded
    patterns above are what keep a finish from reading as a stoppage.
    """
    msgs = sorted((m for m in race_control if isinstance(m.get("lap_number"), int)),
                  key=lambda m: (_sort_key(m) is None, _sort_key(m) or 0))
    bands: list[dict] = []
    open_: dict | None = None

    def close(lap: int) -> None:
        nonlocal open_
        if open_ is not None:
            open_["to"] = max(open_["from"], lap)
            bands.append(open_)
            open_ = None

    for m in msgs:
        txt = (m.get("message") or "").upper()
        lap = m["lap_number"]
        if "CHEQUERED" in txt:
            continue
        if _VSC_DEPLOYED.search(txt):
            close(lap)
            open_ = {"kind": "VSC", "from": lap, "to": lap}
        elif _SC_DEPLOYED.search(txt):
            close(lap)
            open_ = {"kind": "SC", "from": lap, "to": lap}
        elif _RED.search(txt) and (m.get("flag") or "").upper() == "RED":
            close(lap)
            open_ = {"kind": "RED", "from": lap, "to": lap}
        elif open_ is not None and (
            (open_["kind"] == "SC" and _SC_IN.search(txt))
            or (open_["kind"] == "VSC" and _VSC_ENDING.search(txt))
            or (open_["kind"] == "RED" and _RESUME.search(txt))
        ):
            close(lap)
    if open_ is not None:
        close(total_laps or open_["from"])
    return bands


def build_lap_charts(
    session_key: int,
    laps: list[dict],
    stints: list[dict],
    pit: list[dict],
    race_control: list[dict],
    drivers: list[dict],
    classification: list[dict] | None = None,
) -> dict:
    """
    ``classification`` is the analysis's race_classification when there is
    one; without it the order is read from the laps (most laps, least time),
    which is right for a clean race and approximate when a lap is missing.
    """
    by_driver: dict[int, dict[int, dict]] = {}
    for lap in laps:
        dn, ln, dur = lap.get("driver_number"), lap.get("lap_number"), lap.get("lap_duration")
        if isinstance(dn, int) and isinstance(ln, int) and isinstance(dur, (int, float)) and dur > 0:
            by_driver.setdefault(dn, {})[ln] = {"time": float(dur), "out": bool(lap.get("is_pit_out_lap"))}

    pit_laps: dict[int, set[int]] = {}
    for p in pit:
        dn, ln = p.get("driver_number"), p.get("lap_number")
        if isinstance(dn, int) and isinstance(ln, int):
            pit_laps.setdefault(dn, set()).add(ln)

    stints_by: dict[int, list[dict]] = {}
    for st in stints:
        dn = st.get("driver_number")
        if isinstance(dn, int) and isinstance(st.get("stint_number"), int):
            stints_by.setdefault(dn, []).append({
                "stint_number": st["stint_number"],
                "compound": st.get("compound"),
                "lap_start": st.get("lap_start"),
                "lap_end": st.get("lap_end"),
                "tyre_age_at_start": st.get("tyre_age_at_start"),
            })

    info = {d.get("driver_number"): d for d in drivers if isinstance(d.get("driver_number"), int)}
    total_laps = max((max(v) for v in by_driver.values() if v), default=0)

    # Finishing order from the laps themselves: most laps, then least time.
    def order_key(dn: int) -> tuple:
        laps_ = by_driver.get(dn, {})
        return (-len(laps_), sum(v["time"] for v in laps_.values()))

    official = {
        r.get("driver_number"): r.get("finishing_position")
        for r in (classification or [])
        if isinstance(r.get("driver_number"), int) and isinstance(r.get("finishing_position"), int)
    }
    ranked = sorted(by_driver, key=lambda dn: (official.get(dn, 999),) + order_key(dn))
    out_drivers = []
    for pos, dn in enumerate(ranked, start=1):
        d = info.get(dn, {})
        colour = d.get("team_colour")
        out_drivers.append({
            "number": dn,
            "code": d.get("name_acronym") or f"D{dn}",
            "colour": f"#{colour}" if colour else "#8A94A6",
            "team": d.get("team_name"),
            "position": pos,
            "laps": [[ln, round(v["time"], 3), v["out"], ln in pit_laps.get(dn, set())]
                     for ln, v in sorted(by_driver[dn].items())],
            "stints": sorted(stints_by.get(dn, []), key=lambda s: s["stint_number"]),
        })

    return {
        "version": LAP_CHARTS_VERSION,
        "session_key": session_key,
        "total_laps": total_laps,
        "winner": out_drivers[0]["code"] if out_drivers else None,
        "bands": neutralised_bands(race_control, total_laps),
        "drivers": out_drivers,
    }
