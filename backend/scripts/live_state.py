"""
RaceState — in-memory snapshot of a session as it happens. Experimental.

Fed either by MQTT (live_server.py) or by replaying a cached session
(`--replay 9636`), which is how the existing services get tested against
partial data without waiting for a race.

    python scripts/live_state.py --replay 9636 --until-lap 20 --dump /tmp/s.json

Design: the snapshot keeps both a *derived* view (position per driver, current
stint, flag) and the *raw* message lists per topic. The raw lists are what the
existing services already take as arguments, so chaos_service and
weather_conditions can be called on a half-finished race without touching them.

Nothing here writes to the recorder's files or imports anything that mutates
shared state; TokenManager is only used by live_server.py, read-only.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import threading
import time
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, ".")

# Topic → the key each document is identified by, and how the snapshot uses it.
TOPICS = [
    "v1/laps", "v1/pit", "v1/position", "v1/intervals", "v1/race_control",
    "v1/weather", "v1/stints", "v1/drivers", "v1/team_radio", "v1/session_result",
]

# Bounded so a long session cannot grow without limit. intervals/position are the
# high-volume ones; the services that need them only look at ordering.
MAX_PER_TOPIC = {
    "v1/intervals": 40000,
    "v1/position": 20000,
    "v1/laps": 20000,
}
MAX_DEFAULT = 5000

FLAG_GREEN, FLAG_YELLOW, FLAG_SC, FLAG_VSC, FLAG_RED = "GREEN", "YELLOW", "SC", "VSC", "RED"

# Word-bounded: "CHEQUERED FLAG" contains the substring "RED FLAG".
_RED_RE = re.compile(r"(^|\s)RED FLAG")
_CHEQUERED_RE = re.compile(r"CHEQUERED")


def iso(t: float) -> str:
    return datetime.fromtimestamp(t, timezone.utc).isoformat(timespec="milliseconds")


class RaceState:
    """One session's live snapshot. Thread-safe for one writer, many readers."""

    def __init__(self, session_key: int | None = None) -> None:
        self.session_key = session_key
        self.lock = threading.RLock()
        self.started = time.time()

        # raw per-topic message lists — what the existing services consume
        self.raw: dict[str, deque] = {t: deque(maxlen=MAX_PER_TOPIC.get(t, MAX_DEFAULT)) for t in TOPICS}

        # derived view
        self.drivers: dict[int, dict] = {}
        self.position: dict[int, int] = {}
        self.last_lap: dict[int, dict] = {}          # dn -> {lap_number, lap_duration, at}
        self.stint: dict[int, dict] = {}             # dn -> {compound, stint_number, lap_start, tyre_age_at_start}
        self.flag: str = FLAG_GREEN
        self.flag_since: float | None = None
        self.flag_source: str = "assumed (no race_control message yet)"
        self.current_lap: int = 0

        # bookkeeping
        self.counts = Counter()
        self.last_update: dict[str, float] = {}
        self.keys_seen: dict[str, dict[str, int]] = defaultdict(dict)   # topic -> key -> times seen
        self.key_updates = Counter()                                    # topic -> updates of an already-seen key
        self.update_log: deque = deque(maxlen=200)                      # recent "this changed" notes
        self.dropped_no_key = Counter()

    # ── ingest ───────────────────────────────────────────────────────────────

    def ingest(self, topic: str, msg: dict, recv: float | None = None) -> dict | None:
        """
        Apply one message. Returns a small dict describing what changed
        (or None if it was ignored), which the server streams as a delta.
        """
        if topic not in self.raw or not isinstance(msg, dict):
            return None
        recv = recv or time.time()
        with self.lock:
            self.counts[topic] += 1
            self.last_update[topic] = recv
            self.raw[topic].append(msg)

            if self.session_key is None and isinstance(msg.get("session_key"), int):
                self.session_key = msg["session_key"]

            # _key tells an update of a known document from a new fact
            key = msg.get("_key")
            is_update = False
            if isinstance(key, str):
                seen = self.keys_seen[topic]
                if key in seen:
                    is_update = True
                    seen[key] += 1
                    self.key_updates[topic] += 1
                    self.update_log.append({
                        "at": recv, "iso": iso(recv), "topic": topic, "_key": key,
                        "times": seen[key],
                    })
                else:
                    seen[key] = 1
            else:
                self.dropped_no_key[topic] += 1

            changed = {"topic": topic, "is_update": is_update, "_key": key}
            handler = getattr(self, f"_on_{topic.split('/')[-1]}", None)
            if handler:
                try:
                    extra = handler(msg, recv)
                    if extra:
                        changed.update(extra)
                except Exception as exc:     # a bad message must not kill ingestion
                    changed["error"] = f"{type(exc).__name__}: {exc}"
            return changed

    # ── per-topic handlers ───────────────────────────────────────────────────

    def _on_drivers(self, msg: dict, recv: float) -> dict:
        dn = msg.get("driver_number")
        if not isinstance(dn, int):
            return {}
        self.drivers[dn] = {
            "driver_number": dn,
            "code": msg.get("name_acronym") or f"D{dn}",
            "team": msg.get("team_name"),
            "colour": msg.get("team_colour"),
        }
        return {"driver": dn}

    def _on_position(self, msg: dict, recv: float) -> dict:
        dn, pos = msg.get("driver_number"), msg.get("position")
        if not isinstance(dn, int) or not isinstance(pos, int):
            return {}
        prev = self.position.get(dn)
        self.position[dn] = pos
        return {"driver": dn, "position": pos, "from": prev} if prev != pos else {"driver": dn}

    def _on_laps(self, msg: dict, recv: float) -> dict:
        dn, ln = msg.get("driver_number"), msg.get("lap_number")
        if not isinstance(dn, int) or not isinstance(ln, int):
            return {}
        dur = msg.get("lap_duration")
        prev = self.last_lap.get(dn, {})
        # A lap arrives first without a duration and is completed later — that is
        # the main source of _key updates on this topic.
        self.last_lap[dn] = {
            "lap_number": ln,
            "lap_duration": dur if dur is not None else prev.get("lap_duration") if prev.get("lap_number") == ln else None,
            "is_pit_out_lap": msg.get("is_pit_out_lap"),
            "at": recv,
        }
        self.current_lap = max(self.current_lap, ln)
        return {"driver": dn, "lap": ln, "lap_duration": dur}

    def _on_stints(self, msg: dict, recv: float) -> dict:
        dn = msg.get("driver_number")
        if not isinstance(dn, int):
            return {}
        self.stint[dn] = {
            "compound": msg.get("compound"),
            "stint_number": msg.get("stint_number"),
            "lap_start": msg.get("lap_start"),
            "lap_end": msg.get("lap_end"),
            "tyre_age_at_start": msg.get("tyre_age_at_start"),
        }
        return {"driver": dn, "compound": msg.get("compound")}

    def _on_race_control(self, msg: dict, recv: float) -> dict:
        txt = (msg.get("message") or "").upper()
        flag = (msg.get("flag") or "").upper()
        new = None
        if _CHEQUERED_RE.search(txt):
            new = FLAG_GREEN                      # session over; not a neutralisation
        elif flag == "RED" or _RED_RE.search(txt):
            new = FLAG_RED
        elif "SAFETY CAR DEPLOYED" in txt and "VIRTUAL" not in txt:
            new = FLAG_SC
        elif "VIRTUAL SAFETY CAR DEPLOYED" in txt:
            new = FLAG_VSC
        elif "SAFETY CAR IN THIS LAP" in txt or "VIRTUAL SAFETY CAR ENDING" in txt:
            new = FLAG_GREEN
        elif flag == "GREEN" or "TRACK CLEAR" in txt:
            new = FLAG_GREEN
        elif flag in ("YELLOW", "DOUBLE YELLOW"):
            # A sector yellow does not override an active neutralisation
            new = FLAG_YELLOW if self.flag in (FLAG_GREEN, FLAG_YELLOW) else None
        elif flag == "CLEAR" and self.flag == FLAG_YELLOW:
            new = FLAG_GREEN
        if new and new != self.flag:
            prev = self.flag
            self.flag, self.flag_since = new, recv
            self.flag_source = (msg.get("message") or flag or "?")[:120]
            return {"flag": new, "from": prev, "because": self.flag_source}
        return {}

    def _on_pit(self, msg: dict, recv: float) -> dict:
        return {"driver": msg.get("driver_number"), "pit_lap": msg.get("lap_number")}

    # ── snapshot ─────────────────────────────────────────────────────────────

    def lists(self) -> dict[str, list]:
        """Raw per-topic lists, as the existing services expect them."""
        with self.lock:
            return {t: list(d) for t, d in self.raw.items()}

    def snapshot(self, include_analysis: bool = True) -> dict:
        with self.lock:
            order = sorted(self.position.items(), key=lambda kv: kv[1])
            grid = []
            for dn, pos in order:
                d = self.drivers.get(dn, {})
                lap = self.last_lap.get(dn, {})
                st = self.stint.get(dn, {})
                grid.append({
                    "position": pos,
                    "driver_number": dn,
                    "code": d.get("code", f"D{dn}"),
                    "team": d.get("team"),
                    "colour": d.get("colour"),
                    "lap_number": lap.get("lap_number"),
                    "last_lap_s": lap.get("lap_duration"),
                    "compound": st.get("compound"),
                    "stint": st.get("stint_number"),
                    "tyre_age_at_start": st.get("tyre_age_at_start"),
                })
            snap = {
                "session_key": self.session_key,
                "generated_at": iso(time.time()),
                "uptime_s": round(time.time() - self.started, 1),
                "current_lap": self.current_lap,
                "flag": self.flag,
                "flag_since": iso(self.flag_since) if self.flag_since else None,
                "flag_source": self.flag_source,
                "drivers_known": len(self.drivers),
                "grid": grid,
                "messages": dict(self.counts),
                "messages_total": sum(self.counts.values()),
                "last_update": {t: iso(v) for t, v in sorted(self.last_update.items())},
                "key_updates": dict(self.key_updates),
                "messages_without_key": dict(self.dropped_no_key),
                "recent_key_updates": list(self.update_log)[-10:],
            }
        if include_analysis:
            snap["analysis"] = run_partial_analysis(self)
        return snap


# ── Task 2: existing services against partial state ─────────────────────────

def run_partial_analysis(state: RaceState) -> dict:
    """
    Call the real services on the partial snapshot. Each one is isolated: a
    failure is reported, never raised, and the reason is kept so the
    limitations are visible in the page instead of hidden.
    """
    from app.services import chaos_service, weather_conditions
    from app.services.timeline_builder import build_race_timeline

    d = state.lists()
    laps = d["v1/laps"]
    out: dict[str, Any] = {"inputs": {k.replace("v1/", ""): len(v) for k, v in d.items()}}

    # weather_conditions — pure functions over (weather, laps)
    try:
        periods = weather_conditions.detect_rain_periods(d["v1/weather"], laps)
        idx = weather_conditions.lap_time_index(laps)
        wet = weather_conditions.wet_lap_numbers(periods, idx)
        out["weather_conditions"] = {
            "ok": True,
            "rain_periods": len(periods),
            "wet_laps": len(wet),
            "laps_indexed": len(idx),
            "note": "operates on elapsed laps only; a period still running is "
                    "counted once it reaches MIN_WET_RECORDS",
        }
    except Exception as exc:
        out["weather_conditions"] = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}

    # chaos_service 2.0 — needs a RaceTimeline
    try:
        timeline = build_race_timeline(
            laps_data=laps, weather_data=d["v1/weather"], race_control_data=d["v1/race_control"],
            pit_data=d["v1/pit"], interval_data=d["v1/intervals"], position_data=d["v1/position"],
            session_key=state.session_key or 0,
        )
        chaos = chaos_service.compute_chaos_index(
            timeline, d["v1/race_control"], laps, d["v1/position"], d["v1/pit"]
        )
        out["chaos"] = {
            "ok": True,
            "score": chaos.score,
            "level": chaos.level,
            "method_version": chaos.method_version,
            "peak_chaos_lap": chaos.peak_chaos_lap,
            "components": chaos.components.model_dump(),
            "breakdown": {k: {"raw": v.raw, "normalized": v.normalized, "points": v.points}
                          for k, v in chaos.breakdown.items()},
            "timeline_total_laps": timeline.total_laps,
            "caveat": "timeline.total_laps is the LAPS RUN SO FAR, not the race "
                      "distance: every component is a fraction of elapsed race, so "
                      "the score is 'chaos density so far', not comparable to a "
                      "finished race until the flag drops",
        }
    except Exception as exc:
        out["chaos"] = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}

    # pit_cycle_service — expected to be unsafe live; probe and report
    try:
        from app.services.pit_cycle_service import SETTLE_LAPS, detect_pit_cycles
        from app.services.pit_service import compute_pit_impact_with_cycles
        rows, cycles = compute_pit_impact_with_cycles(
            d["v1/pit"], d["v1/position"], laps, list(state.drivers.values()),
            d["v1/race_control"], timeline,
        )
        open_cycles = [c for c in cycles if c.close_lap >= timeline.total_laps]
        out["pit_cycles"] = {
            "ok": True,
            "cycles": len(cycles),
            "stops": len(rows),
            "cycles_not_yet_closed": len(open_cycles),
            "unsafe": bool(open_cycles),
            "caveat": f"a cycle is read at last_stop_lap + {SETTLE_LAPS}, clamped to "
                      f"total_laps (={timeline.total_laps} = current lap live). Any cycle whose "
                      f"close_lap equals the current lap is read too early: its deltas "
                      f"are provisional and will change.",
        }
    except Exception as exc:
        out["pit_cycles"] = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}

    return out


# ── replay (testing without a live session) ─────────────────────────────────

def replay(session_key: int, state: RaceState, until_lap: int | None = None,
           speed: float = 0.0, on_tick=None) -> dict:
    """
    Feed a cached session's raw endpoints into the snapshot in the order MQTT
    would have delivered them.

    The endpoints do not share a timestamp field: position/pit/race_control/
    weather/intervals/team_radio carry `date`, laps carry `date_start`, stints
    carry only `lap_start`, and drivers carry nothing. So laps are ordered by
    date_start, stints are placed at the start time of their first lap, and
    drivers (session setup) are fed first.
    """
    cache_dir = Path("cache") / str(session_key)
    if not cache_dir.is_dir():
        raise SystemExit(f"no cached session at {cache_dir}")

    raw: dict[str, list[dict]] = {}
    for topic in TOPICS:
        p = cache_dir / f"{topic.replace('v1/', '')}.json"
        if p.exists():
            data = json.loads(p.read_text())
            if isinstance(data, list):
                raw[topic] = [r for r in data if isinstance(r, dict)]

    # lap number -> earliest start time, to place records that only know a lap
    lap_time: dict[int, str] = {}
    for rec in raw.get("v1/laps", []):
        ln, ds = rec.get("lap_number"), rec.get("date_start")
        if isinstance(ln, int) and ds and (ln not in lap_time or ds < lap_time[ln]):
            lap_time[ln] = ds
    first_time = min(lap_time.values()) if lap_time else ""

    def stamp(topic: str, rec: dict) -> str:
        if topic == "v1/laps":
            return rec.get("date_start") or first_time
        if topic == "v1/stints":
            return lap_time.get(rec.get("lap_start"), first_time)
        return rec.get("date") or first_time

    events = [(stamp(t, r), t, r) for t, rs in raw.items() for r in rs if t != "v1/drivers"]
    events.sort(key=lambda e: e[0])

    fed = 0
    for rec in raw.get("v1/drivers", []):      # setup first: codes and teams
        state.ingest("v1/drivers", rec)
        fed += 1
    for _, topic, rec in events:
        state.ingest(topic, rec)
        fed += 1
        if until_lap and state.current_lap >= until_lap:
            break
        if speed and fed % 50 == 0:
            time.sleep(speed)
        if on_tick and fed % 2000 == 0:
            on_tick(state, fed)
    return {"events_available": len(events) + len(raw.get("v1/drivers", [])),
            "events_fed": fed, "reached_lap": state.current_lap,
            "topics_found": sorted(k.replace("v1/", "") for k in raw)}


def main() -> int:
    ap = argparse.ArgumentParser(description="RaceState snapshot + partial-analysis probe.")
    ap.add_argument("--replay", type=int, metavar="SESSION_KEY", required=True)
    ap.add_argument("--until-lap", type=int, default=0)
    ap.add_argument("--dump", metavar="FILE", help="write the full snapshot JSON here")
    args = ap.parse_args()

    state = RaceState()
    info = replay(args.replay, state, until_lap=args.until_lap or None)
    snap = state.snapshot()

    print(f"replay {args.replay}: fed {info['events_fed']} of {info['events_available']} events, "
          f"reached lap {info['reached_lap']}")
    print(f"flag={snap['flag']} ({snap['flag_source'][:60]}) · drivers={snap['drivers_known']} · "
          f"current_lap={snap['current_lap']}")
    print(f"messages: {snap['messages_total']} · key updates: {snap['key_updates']}")
    print("\ntop of the order:")
    for row in snap["grid"][:6]:
        print(f"  P{row['position']:<2} {row['code']:<4} lap {str(row['lap_number']):<3} "
              f"last {str(row['last_lap_s']):<8} {str(row['compound']):<12} stint {row['stint']}")
    a = snap["analysis"]
    print("\npartial analysis:")
    for name in ("weather_conditions", "chaos", "pit_cycles"):
        r = a.get(name, {})
        if r.get("ok"):
            body = {k: v for k, v in r.items() if k not in ("ok", "caveat", "note", "breakdown")}
            print(f"  {name}: OK {body}")
        else:
            print(f"  {name}: FAILED {r.get('error')}")
    if args.dump:
        Path(args.dump).write_text(json.dumps(snap, indent=1, default=str), encoding="utf-8")
        print(f"\nsnapshot: {args.dump}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
