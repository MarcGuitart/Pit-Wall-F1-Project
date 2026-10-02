"""
RaceState — in-memory snapshot of a session as it happens.

Fed by one of three sources, all through the same ``ingest()``:

    MQTT                    live_server.py, a real session
    a recorded capture      --replay-capture live/2026-09-26_race_11377
    a cached session        --replay 11377          (REST JSON, no timing)

The capture replay is the one that matters for development: it is the actual
byte stream of a race, with the real arrival times, so every ordering problem
the live path has — a lap that arrives before its duration, a pit cycle read
while it is still open, a 28-second hole in the feed — happens again on demand.

    python scripts/live_state.py --replay-capture live/2026-09-26_race_11377 \
        --speed 200 --until-lap 20 --dump /tmp/s.json

Design: the snapshot keeps both a *derived* view (the tower, the flag, tyre
ages) and the *raw* per-topic documents. The raw documents are what the
existing post-race services already take as arguments, so chaos_service and
pit_cycle_service can be called on a half-finished race without touching them.

What this module must never do is present a live reading as if it were a
finished one. Three places where that would be easy, and what is done instead:

  · chaos    — every component is a fraction of the race. Live, the
               denominator is the laps run so far, so the score is a density,
               not a comparable index. No level is published until the
               chequered flag. See ``_chaos()``.
  · pit      — a cycle is read SETTLE_LAPS after its last stop. Until then the
               deltas move. Open cycles are published without deltas, as
               "in progress". See ``_pit()``.
  · pit watch— the signals are measurements of the present (stint length, pace
               loss, a rival's fresher tyre), never a predicted stop lap.

Nothing here writes to the recorder's files. TokenManager is used only by
live_server.py, read-only.
"""
from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
import time
from collections import Counter, OrderedDict, defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Any, Callable, Iterable

sys.path.insert(0, ".")

from app.utils.time import parse_utc  # noqa: E402  — the one feed-timestamp parser

TOPICS = [
    "v1/laps", "v1/pit", "v1/position", "v1/intervals", "v1/race_control",
    "v1/weather", "v1/stints", "v1/drivers", "v1/team_radio", "v1/session_result",
]

# Documents kept per topic, most recent wins. Keyed by ``_key``, so a lap that
# is republished with its duration replaces the empty one instead of being
# counted twice.
MAX_PER_TOPIC = {"v1/intervals": 40000, "v1/position": 20000, "v1/laps": 20000}
MAX_DEFAULT = 5000

# Fields that carry a timestamp, per topic. OpenF1 sends these naive over MQTT
# and offset-qualified over REST; both are UTC. Normalised on the way in so the
# services downstream compare like with like.
DATE_FIELDS = ("date", "date_start", "date_end", "_date_start_last_lap")

FLAG_GREEN, FLAG_YELLOW, FLAG_SC, FLAG_VSC, FLAG_RED = "GREEN", "YELLOW", "SC", "VSC", "RED"

# Word-bounded, as a project rule: "CHEQUERED FLAG" contains the substring
# "RED FLAG", and a naive `"RED FLAG" in txt` ends a race with a red flag.
_RED_RE = re.compile(r"\bRED FLAG\b")
_CHEQUERED_RE = re.compile(r"\bCHEQUERED\b")
_SC_DEPLOY_RE = re.compile(r"\bSAFETY CAR DEPLOYED\b")
_VSC_DEPLOY_RE = re.compile(r"\bVIRTUAL SAFETY CAR DEPLOYED\b")
_SC_ENDING_RE = re.compile(r"\bSAFETY CAR IN THIS LAP\b")
_VSC_ENDING_RE = re.compile(r"\bVIRTUAL SAFETY CAR ENDING\b")
_TRACK_CLEAR_RE = re.compile(r"\bTRACK CLEAR\b")
_SESSION_FINISH_RE = re.compile(r"\bSESSION (FINISHED|STOPPED)\b")

# Staleness is measured on the topics that tick continuously while cars are
# running: intervals arrive roughly every 4 s per driver, laps once a lap.
# weather is one record a minute and race_control is sporadic, so including
# them would hide an outage behind a weather tick.
#
# The threshold is set above the recorder's real Baku outages (4.0 s, 4.5 s and
# 28.6 s) being *visible*, not below them: 25 s flags the 28.6 s hole and the
# 76 s of silence around it without firing on ordinary jitter. Silence is only
# tracked between the first lap and the chequered flag — before the start and
# after the finish the feed is quiet because nothing is happening.
LIVE_TOPICS = ("v1/intervals", "v1/laps", "v1/position")
STALE_AFTER_S = 25.0

# A driver whose last lap message is older than this is treated as no longer
# running — retired, in the garage, or behind a red flag. Used to decide when
# the *field* has passed a lap, which is not the same as when the leader has.
RUNNING_WINDOW_S = 300.0

# Chaos is a fraction of the race, and early on the fraction is nonsense: on
# lap 1 the denominator is 1, so one sector yellow reads as "the whole race has
# been yellow". Worse, the start saturates two components on its own — every car
# changes position off the line, and a standing start reliably draws yellows —
# so the density peaks at lap 1 and falls for the rest of the race.
#
# 10 laps is about a fifth of a Baku race: enough denominator that the start is
# no longer the whole sample. Below it nothing is published, because a
# meaningless number on screen is worse than an empty panel with a reason in it.
MIN_CHAOS_LAPS = 10


def iso(t: float) -> str:
    return datetime.fromtimestamp(t, timezone.utc).isoformat(timespec="milliseconds")


def normalise_dates(msg: dict) -> dict:
    """
    Rewrite every timestamp in a message to an offset-qualified UTC string.

    This is the ingest half of the naive/aware fix. ``parse_utc`` makes the
    datetime comparisons safe; this makes the *string* comparisons safe too —
    ``position_at_lap`` orders position records by comparing their ISO text,
    and "…652000" sorts after "…652000+00:00", so a mixed batch silently
    returns the wrong position rather than raising.
    """
    for field in DATE_FIELDS:
        value = msg.get(field)
        if isinstance(value, str):
            parsed = parse_utc(value)
            if parsed is not None:
                msg[field] = parsed.isoformat()
    return msg


class RaceState:
    """One session's live snapshot. One writer, many readers."""

    def __init__(self, session_key: int | None = None) -> None:
        self.session_key = session_key
        self.lock = RLock()

        # "Now", from the snapshot's point of view. Live this is the wall clock.
        # During a paced capture replay it is the replay's position in the
        # recording, so a feed that went quiet for 28 s in September reads as
        # 28 s of silence now, and the staleness warning fires when it did.
        self.clock: Callable[[], float] = time.time
        self.started = self.clock()

        # topic -> _key -> document. Ordered: insertion order is arrival order,
        # and an upsert keeps the original slot, which is what the services
        # expect of a list that used to come from REST in chronological order.
        self.store: dict[str, OrderedDict[str, dict]] = {t: OrderedDict() for t in TOPICS}
        self._synthetic = Counter()      # per-topic counter for documents with no _key

        # session identity — never arrives on a live topic, so the caller sets
        # it once it knows (a REST lookup at startup, or a cached
        # _session_meta.json during replay). Unknown defaults to the "race"
        # profile: the one this module was built around first, and the safe
        # direction if a profile is ever genuinely unknown live.
        self.session_type: str | None = None
        self.session_name: str | None = None
        self.location: str | None = None       # the GP's host city/circuit — see
        # set_session_meta()'s own note on why this is not country_name.

        # derived view
        self.drivers: dict[int, dict] = {}
        self.position: dict[int, int] = {}
        self.gap: dict[int, dict] = {}               # dn -> {gap_to_leader, interval, at}
        self.last_lap: dict[int, dict] = {}          # dn -> {lap_number, lap_duration, at}
        self.lap_times: dict[int, dict[int, float]] = defaultdict(dict)   # dn -> lap -> duration
        # dn -> lap -> the recv timestamp *that specific lap* completed at.
        # last_lap["at"] only ever holds the driver's most recent message, so
        # it cannot date a historical lap once a later one has arrived — using
        # it for that gave every session-best marker in a replayed timeline
        # the same timestamp (the last message received for that driver).
        self.lap_completed_at: dict[int, dict[int, float]] = defaultdict(dict)
        # dn -> lap -> {sector1/2/3, seg1/2/3, i1_speed, i2_speed, st_speed}.
        # Only practice/qualifying's panels read this (sector colours, ideal
        # lap) — OpenF1 does not publish segments during a race at all.
        self.lap_detail: dict[int, dict[int, dict]] = defaultdict(dict)
        self.stints: dict[int, dict[int, dict]] = defaultdict(dict)       # dn -> stint_number -> rec
        self.pit_laps: dict[int, list[int]] = defaultdict(list)
        self.radio: deque = deque(maxlen=60)

        self.flag: str = FLAG_GREEN
        self.flag_since: float | None = None
        self.flag_source: str = "assumed (no race_control message yet)"
        self.flag_laps: set[int] = set()             # laps seen under SC/VSC/RED, live
        # Time-indexed flag history — closed periods only (the current, still
        # open one is flag/flag_since above). A practice or qualifying session
        # has no shared lap axis (cars run different laps at once), so its
        # timeline and its red-flag tally are built on the session clock, not
        # on lap numbers, which is what this is for.
        self.flag_periods: list[dict] = []
        self.current_lap: int = 0

        self.chequered: bool = False
        self.chequered_lap: int | None = None
        self.race_distance: int | None = None
        self.race_distance_source: str = "unknown"

        # bookkeeping
        self.counts = Counter()
        self.last_update: dict[str, float] = {}
        self.last_message_at: float | None = None
        self.key_updates = Counter()
        self.update_log: deque = deque(maxlen=200)
        self.dropped_no_key = Counter()
        self.gaps: list[dict] = []                   # observed holes in the feed

    # ── session identity ────────────────────────────────────────────────────

    def set_session_meta(self, session_type: str | None, session_name: str | None,
                         location: str | None) -> None:
        """
        Called once, by whoever knows — the CLI replay helpers below read it
        from a cached _session_meta.json; live_server.py reads it from a
        single REST lookup at startup, since no MQTT topic ever carries it.

        ``location`` and not ``country_name``: OpenF1 labels the Kuala Lumpur
        session country_name "Bahrain" (confirmed directly against 11727/
        11728, not assumed) — a leftover from how the calendar entry was
        created, not a data error that is likely to be fixed before tomorrow.
        ``location`` is the host city and has never shown that mislabelling.
        """
        with self.lock:
            self.session_type = session_type
            self.session_name = session_name
            self.location = location

    @property
    def profile(self) -> str:
        """
        "practice" | "qualifying" | "race" — which panel set applies.

        Unknown session_type (never set, or a value this project has not
        seen) defaults to "race": the profile every service downstream was
        built for, and the one where every existing guarantee (chaos only
        past MIN_CHAOS_LAPS, no level pre-flag, SC/VSC-aware pit cycles)
        already holds. A sprint's session_type is "Race" in OpenF1 regardless
        of its session_name, so it gets the race profile too, correctly — it
        is a real points race with a real finishing order.
        """
        if self.session_type == "Practice":
            return "practice"
        if self.session_type == "Qualifying":
            return "qualifying"
        return "race"

    # ── ingest ───────────────────────────────────────────────────────────────

    def ingest(self, topic: str, msg: dict, recv: float | None = None) -> dict | None:
        """Apply one message. Returns a small description of what changed."""
        if topic not in self.store or not isinstance(msg, dict):
            return None
        recv = recv if recv is not None else self.clock()
        msg = normalise_dates(dict(msg))
        with self.lock:
            if topic in LIVE_TOPICS:
                racing = self.current_lap > 0 and not self.chequered
                if racing and self.last_message_at is not None and recv - self.last_message_at >= STALE_AFTER_S:
                    self.gaps.append({
                        "from": iso(self.last_message_at), "to": iso(recv),
                        "seconds": round(recv - self.last_message_at, 1),
                        "at_lap": self.current_lap,
                    })
                self.last_message_at = recv
            self.counts[topic] += 1
            self.last_update[topic] = recv

            key = msg.get("_key")
            bucket = self.store[topic]
            if isinstance(key, str):
                is_update = key in bucket
                if is_update:
                    self.key_updates[topic] += 1
                    self.update_log.append({"at": recv, "iso": iso(recv), "topic": topic, "_key": key})
                bucket[key] = msg                      # upsert; keeps the original slot
            else:
                is_update = False
                self.dropped_no_key[topic] += 1
                self._synthetic[topic] += 1
                bucket[f"_n{self._synthetic[topic]}"] = msg
            limit = MAX_PER_TOPIC.get(topic, MAX_DEFAULT)
            while len(bucket) > limit:
                bucket.popitem(last=False)

            changed = {"topic": topic, "is_update": is_update, "_key": key}
            if self.session_key is None and isinstance(msg.get("session_key"), int):
                self.session_key = msg["session_key"]
            handler = getattr(self, f"_on_{topic.split('/')[-1]}", None)
            if handler:
                try:
                    extra = handler(msg, recv)
                    if extra:
                        changed.update(extra)
                except Exception as exc:      # one bad message must not stop ingestion
                    changed["error"] = f"{type(exc).__name__}: {exc}"
            return changed

    # ── per-topic handlers ───────────────────────────────────────────────────

    def _on_drivers(self, msg: dict, recv: float) -> dict:
        dn = msg.get("driver_number")
        if not isinstance(dn, int):
            return {}
        self.drivers[dn] = {
            "driver_number": dn,
            "name_acronym": msg.get("name_acronym") or f"D{dn}",
            "code": msg.get("name_acronym") or f"D{dn}",
            "full_name": msg.get("full_name"),
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

    def _on_intervals(self, msg: dict, recv: float) -> dict:
        dn = msg.get("driver_number")
        if not isinstance(dn, int):
            return {}
        self.gap[dn] = {
            "gap_to_leader": msg.get("gap_to_leader"),
            "interval": msg.get("interval"),
            "at": recv,
        }
        return {"driver": dn}

    def _on_laps(self, msg: dict, recv: float) -> dict:
        dn, ln = msg.get("driver_number"), msg.get("lap_number")
        if not isinstance(dn, int) or not isinstance(ln, int):
            return {}
        dur = msg.get("lap_duration")
        if isinstance(dur, (int, float)) and dur > 0:
            self.lap_times[dn][ln] = float(dur)
            self.lap_completed_at[dn][ln] = recv
        prev = self.last_lap.get(dn, {})
        # A lap is published when it starts, without a duration, and republished
        # when it completes. Keep the newest lap number, but never lose a
        # duration that has already arrived for it.
        self.last_lap[dn] = {
            "lap_number": ln,
            "lap_duration": dur if dur is not None else (
                prev.get("lap_duration") if prev.get("lap_number") == ln else None),
            "is_pit_out_lap": msg.get("is_pit_out_lap"),
            "at": recv,
        }
        if ln > self.current_lap:
            self.current_lap = ln
        if self.flag in (FLAG_SC, FLAG_VSC, FLAG_RED):
            self.flag_laps.add(ln)

        # Sector times, mini-sector colours and speed traps — practice/quali
        # only read this, but it costs nothing to keep it always, and OpenF1
        # fills it in incrementally (a sector arrives as its own car crosses
        # the line), so each field is stored only when actually present
        # rather than overwriting a known value with a not-yet-arrived None.
        detail = self.lap_detail[dn].setdefault(ln, {})
        for field, key in (
            ("duration_sector_1", "sector1"), ("duration_sector_2", "sector2"),
            ("duration_sector_3", "sector3"), ("segments_sector_1", "seg1"),
            ("segments_sector_2", "seg2"), ("segments_sector_3", "seg3"),
            ("i1_speed", "i1_speed"), ("i2_speed", "i2_speed"), ("st_speed", "st_speed"),
        ):
            value = msg.get(field)
            if value is not None:
                detail[key] = value
        return {"driver": dn, "lap": ln, "lap_duration": dur}

    def _on_stints(self, msg: dict, recv: float) -> dict:
        dn, sn = msg.get("driver_number"), msg.get("stint_number")
        if not isinstance(dn, int) or not isinstance(sn, int):
            return {}
        self.stints[dn][sn] = {
            "stint_number": sn,
            "compound": msg.get("compound"),
            "lap_start": msg.get("lap_start"),
            "lap_end": msg.get("lap_end"),
            "tyre_age_at_start": msg.get("tyre_age_at_start"),
        }
        return {"driver": dn, "compound": msg.get("compound")}

    def _on_pit(self, msg: dict, recv: float) -> dict:
        dn, ln = msg.get("driver_number"), msg.get("lap_number")
        if isinstance(dn, int) and isinstance(ln, int) and ln not in self.pit_laps[dn]:
            self.pit_laps[dn].append(ln)
        return {"driver": dn, "pit_lap": ln}

    def _on_team_radio(self, msg: dict, recv: float) -> dict:
        dn = msg.get("driver_number")
        self.radio.appendleft({
            "driver_number": dn,
            "code": self.drivers.get(dn, {}).get("code", f"D{dn}"),
            "date": msg.get("date"),
            "lap_number": self.current_lap or None,
            "recording_url": msg.get("recording_url"),
        })
        return {"driver": dn, "radio": True}

    def _on_session_result(self, msg: dict, recv: float) -> dict:
        # Only trusted once the flag has dropped — see resolve_race_distance().
        return {"classified": msg.get("position")}

    def _on_race_control(self, msg: dict, recv: float) -> dict:
        txt = (msg.get("message") or "").upper()
        flag = (msg.get("flag") or "").upper()
        out: dict = {}

        if _CHEQUERED_RE.search(txt) or _SESSION_FINISH_RE.search(txt):
            if not self.chequered:
                self.chequered = True
                self.chequered_lap = msg.get("lap_number") or self.current_lap
                out["chequered"] = self.chequered_lap
            new = FLAG_GREEN          # the session is over, not neutralised
        elif flag == "RED" or _RED_RE.search(txt):
            new = FLAG_RED
        elif _VSC_DEPLOY_RE.search(txt):
            new = FLAG_VSC
        elif _SC_DEPLOY_RE.search(txt):
            new = FLAG_SC
        elif _SC_ENDING_RE.search(txt) or _VSC_ENDING_RE.search(txt):
            new = FLAG_GREEN
        elif flag == "GREEN" or _TRACK_CLEAR_RE.search(txt):
            new = FLAG_GREEN
        elif flag in ("YELLOW", "DOUBLE YELLOW"):
            # A sector yellow does not override an active neutralisation.
            new = FLAG_YELLOW if self.flag in (FLAG_GREEN, FLAG_YELLOW) else None
        elif flag == "CLEAR" and self.flag == FLAG_YELLOW:
            new = FLAG_GREEN
        else:
            new = None

        lap = msg.get("lap_number")
        if isinstance(lap, int) and (new in (FLAG_SC, FLAG_VSC, FLAG_RED)
                                     or self.flag in (FLAG_SC, FLAG_VSC, FLAG_RED)):
            self.flag_laps.add(lap)

        if new and new != self.flag:
            prev, prev_since = self.flag, self.flag_since
            self.flag, self.flag_since = new, recv
            self.flag_source = (msg.get("message") or flag or "?")[:140]
            if prev_since is not None:
                self.flag_periods.append({
                    "flag": prev, "start": prev_since, "end": recv,
                    "duration_s": round(recv - prev_since, 1),
                })
            out.update({"flag": new, "from": prev, "because": self.flag_source})
            out["banner"] = {
                "flag": new, "from": prev, "at": iso(recv),
                "because": self.flag_source,
                # Severity for the frontend's styling, not a new flag value:
                # a red flag is sober (it is the session stopping, often for a
                # real incident — the banner should inform, not alarm), a
                # safety car is the one that should read as more urgent — it
                # means the session is still live and changing fast.
                "severity": "red" if new == FLAG_RED else "sc" if new in (FLAG_SC, FLAG_VSC) else "normal",
            }
        return out

    # ── race distance ────────────────────────────────────────────────────────

    def resolve_race_distance(self) -> tuple[int | None, str]:
        """
        The scheduled race distance, or None when it is not knowable yet.

        Investigated, and none of these gives it while the race is running:

          v1/sessions        date_start / date_end / circuit only — no lap count
          v1/race_control    no "LAP n/51" message exists in the Baku capture;
                             lap_number is the current lap, never the total
          v1/session_result  number_of_laps is the *classification*: it appears
                             when the race ends. The Baku capture received zero
                             session_result messages in three hours.
          v1/laps            the highest lap number seen, i.e. laps run so far

        So: unknown until the chequered flag, then the leader's completed laps.
        A hardcoded circuit → distance table would fill the gap, but it is a
        guess maintained by hand, not a source, and it is wrong for exactly the
        races where it matters (a red-flagged or timed-out race is short).
        Callers must handle None by publishing a density, not an index.
        """
        with self.lock:
            if self.chequered:
                classified = [
                    r.get("number_of_laps") for r in self.store["v1/session_result"].values()
                    if isinstance(r.get("number_of_laps"), int)
                ]
                if classified:
                    return max(classified), "session_result (post-flag classification)"
                if self.current_lap:
                    return self.current_lap, "laps completed at the chequered flag"
            return None, "unknown until the chequered flag — no live source exists"

    # ── views ────────────────────────────────────────────────────────────────

    def lists(self) -> dict[str, list]:
        """Raw per-topic documents, as the post-race services expect them."""
        with self.lock:
            return {t: [dict(m) for m in b.values()] for t, b in self.store.items()}

    def last_completed_lap(self, dn: int) -> tuple[int | None, float | None]:
        """
        The most recent lap this driver has actually finished, with its time.

        ``last_lap`` tracks the lap a driver is *on*, because that is what the
        order and the stint length are counted from. Its duration is None until
        the lap completes, so reading a lap time off it shows an empty column
        for the whole race. The durations live in ``lap_times``, which only ever
        receives a lap once OpenF1 has published its duration.
        """
        times = self.lap_times.get(dn)
        if not times:
            return None, None
        ln = max(times)
        return ln, times[ln]

    def current_stint(self, dn: int) -> dict:
        by_number = self.stints.get(dn) or {}
        return by_number[max(by_number)] if by_number else {}

    def tower(self) -> list[dict]:
        """The order, with gaps, tyre and stint age. The UI's primary object."""
        rows = []
        for dn, pos in sorted(self.position.items(), key=lambda kv: kv[1]):
            d = self.drivers.get(dn, {})
            lap = self.last_lap.get(dn, {})
            st = self.current_stint(dn)
            gap = self.gap.get(dn, {})
            lap_no = lap.get("lap_number")
            done_lap, done_time = self.last_completed_lap(dn)
            lap_start = st.get("lap_start")
            stint_laps = (lap_no - lap_start + 1) if (lap_no and lap_start) else None
            age_at_start = st.get("tyre_age_at_start")
            rows.append({
                "position": pos,
                "driver_number": dn,
                "code": d.get("code", f"D{dn}"),
                "full_name": d.get("full_name"),
                "team": d.get("team"),
                "colour": d.get("colour"),
                "lap_number": lap_no,
                "last_lap_s": done_time,
                "last_lap_number": done_lap,
                "gap_to_leader": gap.get("gap_to_leader"),
                "interval": gap.get("interval"),
                "compound": st.get("compound"),
                "stint_number": st.get("stint_number"),
                "stint_laps": stint_laps,
                "tyre_age_at_start": age_at_start,
                "tyre_age": (stint_laps + age_at_start) if (stint_laps is not None and age_at_start is not None) else None,
                "stops": len(self.pit_laps.get(dn, [])),
                "pit_laps": sorted(self.pit_laps.get(dn, [])),
                "is_pit_out_lap": lap.get("is_pit_out_lap"),
            })
        return rows

    def session_status(self, now: float | None = None) -> dict:
        """
        The practice/qualifying replacement for Chaos: there is no race
        distance to take a fraction of, so there is nothing to score. What is
        real and useful instead is simply what has happened to the session —
        the current flag, how many times it has gone red, and how much of the
        session's own clock has been lost to red flags.
        """
        now = now if now is not None else self.clock()
        with self.lock:
            periods = list(self.flag_periods)
            if self.flag_since is not None:
                # the still-open current period counts too
                periods = periods + [{"flag": self.flag, "start": self.flag_since,
                                      "end": now, "duration_s": round(now - self.flag_since, 1)}]
            red_periods = [p for p in periods if p["flag"] == FLAG_RED]
            red_seconds = sum(p["duration_s"] for p in red_periods)
            return {
                "flag": self.flag,
                "since": iso(self.flag_since) if self.flag_since else None,
                "source": self.flag_source,
                "red_flags": len(red_periods),
                "minutes_under_red": round(red_seconds / 60, 1),
                "periods": periods,
            }

    def settled_through(self, now: float | None = None) -> int:
        """
        The last lap the whole field has started.

        Not the same as ``current_lap``, which is the leader. A pit cycle is
        read from every participant's position at its close lap, and a driver
        who has not reached that lap has no position at it — reading the cycle
        on the leader's lap silently drops the back of the grid from the very
        comparison the cycle exists to make. So the close test uses this.

        A car that has stopped publishing laps for RUNNING_WINDOW_S is out of
        the count, otherwise one retirement would freeze every cycle for the
        rest of the race.
        """
        now = now if now is not None else self.clock()
        with self.lock:
            running = [
                lap["lap_number"] for dn, lap in self.last_lap.items()
                if lap.get("lap_number") and now - lap.get("at", 0) <= RUNNING_WINDOW_S
            ]
            return min(running) if running else self.current_lap

    def feed_health(self, now: float | None = None) -> dict:
        now = now if now is not None else self.clock()
        with self.lock:
            age = (now - self.last_message_at) if self.last_message_at else None
            racing = self.current_lap > 0 and not self.chequered
            return {
                "last_message_age_s": round(age, 1) if age is not None else None,
                "stale": bool(racing and age is not None and age >= STALE_AFTER_S),
                "racing": racing,
                "stale_after_s": STALE_AFTER_S,
                "messages_total": sum(self.counts.values()),
                "messages": dict(self.counts),
                "key_updates": dict(self.key_updates),
                "messages_without_key": dict(self.dropped_no_key),
                "documents": {t.replace("v1/", ""): len(b) for t, b in self.store.items()},
                "gaps_observed": self.gaps[-10:],
                "gaps_observed_total": len(self.gaps),
                "last_update": {t: iso(v) for t, v in sorted(self.last_update.items())},
            }

    def snapshot(self, include_analysis: bool = True) -> dict:
        with self.lock:
            distance, distance_source = self.resolve_race_distance()
            now = self.clock()
            snap = {
                "session_key": self.session_key,
                "session_type": self.session_type,
                "session_name": self.session_name,
                "location": self.location,     # the GP's host city — never country_name
                "profile": self.profile,
                "generated_at": iso(now),
                "uptime_s": round(now - self.started, 1),
                "current_lap": self.current_lap,
                "race_distance": distance,
                "race_distance_source": distance_source,
                "laps_remaining": (distance - self.current_lap) if distance else None,
                "chequered": self.chequered,
                "chequered_lap": self.chequered_lap,
                "track_status": {
                    "flag": self.flag,
                    "since": iso(self.flag_since) if self.flag_since else None,
                    "source": self.flag_source,
                    "neutralised_laps": sorted(self.flag_laps),
                },
                "drivers_known": len(self.drivers),
                "tower": self.tower(),
                "radio": list(self.radio)[:20],
                "feed": self.feed_health(),
                "recent_key_updates": list(self.update_log)[-10:],
            }
        if include_analysis:
            snap["analysis"] = live_analysis(self)
            snap["notes"] = snap["analysis"].pop("notes", [])
            snap["pit_watch"] = snap["analysis"].pop("pit_watch", [])
            snap["chaos"] = snap["analysis"].pop("chaos", None)
            if self.profile != "race":
                snap["session_status"] = snap["analysis"].pop("session_status", None)
                snap["practice_tower"] = snap["analysis"].pop("practice_tower", [])
                snap["pace"] = snap["analysis"].pop("pace", [])
                snap["long_runs"] = snap["analysis"].pop("long_runs", [])
        return snap


# ── live-safe analysis ───────────────────────────────────────────────────────

def _chaos(state: RaceState, timeline, lists: dict) -> dict:
    """
    chaos_service unchanged, its output re-labelled for a race in progress.

    Every component of the index is ``affected laps / total laps``. Live,
    total_laps is the laps *run so far*, so the same two-lap safety car scores
    50/100 on lap 4 and 4/100 on lap 50. The number is a density, and a density
    has no level: THRESHOLDS were calibrated on finished races. So the level is
    withheld until the chequered flag, when the denominator becomes real.
    """
    from app.services import chaos_service

    if timeline.total_laps < MIN_CHAOS_LAPS:
        return {
            "score": None, "level": None, "final": False,
            "label": "Chaos density so far",
            "denominator_laps": timeline.total_laps,
            "race_distance": None, "race_distance_source": "unknown",
            "method_version": chaos_service.METHOD_VERSION,
            "peak_chaos_lap": None, "breakdown": [],
            "caveat": (
                f"Not published yet: every component is a fraction of the race, and with "
                f"{timeline.total_laps} lap(s) run the denominator is too small for the "
                f"number to mean anything. Shown from lap {MIN_CHAOS_LAPS}."
            ),
        }

    index = chaos_service.compute_chaos_index(
        timeline, lists["v1/race_control"], lists["v1/laps"],
        lists["v1/position"], lists["v1/pit"],
    )
    distance, distance_source = state.resolve_race_distance()
    final = bool(state.chequered and distance)
    return {
        "score": index.score,
        "level": index.level if final else None,
        "final": final,
        "label": "Chaos Index" if final else "Chaos density so far",
        "denominator_laps": timeline.total_laps,
        "race_distance": distance,
        "race_distance_source": distance_source,
        "method_version": index.method_version,
        "peak_chaos_lap": index.peak_chaos_lap,
        "breakdown": [
            {"component": k, "raw": v.raw, "raw_unit": v.raw_unit,
             "normalized": v.normalized, "points": v.points, "weight": v.weight, "note": v.note}
            for k, v in index.breakdown.items()
        ],
        "caveat": (
            f"Scored over {timeline.total_laps} completed lap(s)."
            if final else
            f"Density over the {timeline.total_laps} lap(s) run so far, not over the race "
            f"distance — the race distance is not published by any live OpenF1 topic. "
            f"A level (Low/Medium/High/Extreme) is only meaningful once the denominator "
            f"is final, so none is shown until the chequered flag."
        ),
    }


def _pit(state: RaceState, timeline, lists: dict) -> dict:
    """
    Pit cycles, with the open one held back.

    A cycle is read SETTLE_LAPS laps after its last stop, and close_lap is
    clamped to the last lap known. Live, that clamp silently reads a cycle at
    the current lap: the out-laps have not settled, positions are still moving
    and the deltas published would be wrong and then change. So a cycle whose
    close_lap has not actually been passed is published with its stops and its
    participants but with **no deltas, no undercuts and no summary of who
    gained** — it is "in progress" until the race reaches its close lap.
    """
    from app.services.pit_cycle_service import SETTLE_LAPS
    from app.services.pit_service import compute_pit_impact_with_cycles

    rows, cycles = compute_pit_impact_with_cycles(
        lists["v1/pit"], lists["v1/position"], lists["v1/laps"],
        list(state.drivers.values()), lists["v1/race_control"], timeline,
    )
    settled_through = state.settled_through()
    out = []
    for c in cycles:
        wanted_close = c.lap_end + SETTLE_LAPS
        closed = wanted_close <= settled_through
        entry = {
            "cycle_id": c.cycle_id,
            "lap_start": c.lap_start,
            "lap_end": c.lap_end,
            "stops": c.stops,
            "neutralised": c.neutralised,
            "status": "closed" if closed else "in progress",
            "closes_on_lap": wanted_close,
            "field_through_lap": settled_through,
        }
        if closed:
            entry.update({
                "close_lap": c.close_lap,
                "timing": c.timing,
                "summary": c.summary,
                "undercuts": [u.model_dump() for u in c.undercuts],
                "participants": [p.model_dump() for p in c.participants],
            })
        else:
            entry.update({
                "close_lap": None,
                "timing": None,
                "summary": (
                    f"Laps {c.lap_start}–{c.lap_end}: {c.stops} stop(s) by "
                    f"{len({p.driver_number for p in c.participants if p.stopped})} driver(s). "
                    f"In progress — positions settle on lap {wanted_close} and the field is "
                    f"through lap {settled_through}; no gains or losses are attributed before then."
                ),
                "undercuts": [],
                "participants": [
                    {"driver_number": p.driver_number, "driver_code": p.driver_code,
                     "stopped": p.stopped, "stop_laps": p.stop_laps,
                     "position_before": p.position_before}
                    for p in c.participants if p.stopped
                ],
            })
        out.append(entry)
    return {
        "cycles": out,
        "stops": len(rows),
        "open_cycles": sum(1 for c in out if c["status"] == "in progress"),
        "settle_laps": SETTLE_LAPS,
        "field_through_lap": settled_through,
    }


# ── pit window watch: signals, not predictions ───────────────────────────────
#
# Each signal states something that has already been measured, with the sample
# it rests on. None of them names a lap on which a driver will stop, because
# nothing in the feed supports that claim: a stop is a decision taken on a pit
# wall with information this project does not have (fuel, damage, the team's
# read of the weather). Presenting an inference as a forecast is the one thing
# the post-race analysis refuses to do, and the live view holds the same line.

PACE_LOSS_S = 0.6           # loss against the stint's own best that counts as a signal
PACE_MIN_LAPS = 5           # clean laps in the stint before pace loss is measurable
STINT_LONG_MARGIN = 3       # laps beyond the longest completed stint on the compound
UNDERCUT_GAP_S = 2.5        # a rival this close behind is in undercut range

# A stint is only "long" against something. One completed stint on a compound is
# not a benchmark — it is one team's choice, and comparing the other twenty cars
# to it fires the same signal for half the grid on the lap the first car stops.
# Two is the minimum that can disagree with itself.
MIN_STINT_PEERS = 2

# Per-kind caps. Without them the field-wide signals crowd out the specific
# ones: under a safety car every car that has not stopped trips CHEAP_STOP, and
# they are one fact about the race, not fourteen about drivers.
KIND_CAP = {"CHEAP_STOP_WINDOW": 4, "STINT_LENGTH": 3, "PACE_LOSS": 4, "UNDERCUT_EXPOSURE": 3}


def _clean_lap_times(state: RaceState, dn: int, lap_from: int, lap_to: int) -> list[tuple[int, float]]:
    """Lap times in a range, minus pit in/out laps and neutralised laps."""
    pit = set(state.pit_laps.get(dn, []))
    skip = pit | {l + 1 for l in pit} | state.flag_laps
    return sorted(
        (ln, t) for ln, t in state.lap_times.get(dn, {}).items()
        if lap_from <= ln <= lap_to and ln not in skip
    )


def _pit_watch(state: RaceState) -> list[dict]:
    signals: list[dict] = []
    tower = state.tower()
    by_position = {r["position"]: r for r in tower}

    # longest stint already *completed* on each compound, this race, this track
    completed: dict[str, list[int]] = defaultdict(list)
    for dn, by_number in state.stints.items():
        for sn, st in by_number.items():
            if sn + 1 in by_number and st.get("lap_start") and st.get("lap_end"):
                comp = st.get("compound")
                if comp:
                    completed[comp].append(st["lap_end"] - st["lap_start"] + 1)

    cheap_stop = state.flag in (FLAG_SC, FLAG_VSC)

    for row in tower:
        dn, code = row["driver_number"], row["code"]
        stint_laps, compound = row["stint_laps"], row["compound"]
        if not stint_laps or not compound:
            continue
        st = state.current_stint(dn)
        lap_start = st.get("lap_start") or 1

        # 1 — stint longer than anything completed on this compound so far
        peers = completed.get(compound) or []
        if len(peers) >= MIN_STINT_PEERS:
            longest = max(peers)
            if stint_laps >= longest + STINT_LONG_MARGIN:
                signals.append({
                    "driver_number": dn, "driver_code": code, "kind": "STINT_LENGTH",
                    "sort_key": -stint_laps,
                    "headline": f"{code} {stint_laps} laps on {compound}",
                    "measurement": (
                        f"{stint_laps} laps into this {compound} stint (from L{lap_start}). "
                        f"The longest {compound} stint completed in this race so far is "
                        f"{longest} laps, across {len(peers)} stint(s)."
                    ),
                    "confidence": "High" if len(peers) >= 4 else "Medium",
                    "basis": f"{len(peers)} completed {compound} stint(s) in this race",
                })

        # 2 — pace loss against the driver's own best in this stint
        laps = _clean_lap_times(state, dn, lap_start, state.current_lap)
        if len(laps) >= PACE_MIN_LAPS:
            best = min(t for _, t in laps)
            recent = [t for _, t in laps[-3:]]
            loss = statistics.median(recent) - best
            if loss >= PACE_LOSS_S:
                signals.append({
                    "driver_number": dn, "driver_code": code, "kind": "PACE_LOSS",
                    "sort_key": -loss,
                    "headline": f"{code} +{loss:.2f}s off own stint best",
                    "measurement": (
                        f"Median of the last {len(recent)} clean laps is {loss:.2f}s slower than "
                        f"{code}'s best lap of this stint ({best:.3f}s). "
                        f"{len(laps)} clean laps in the stint; pit in/out and neutralised laps excluded."
                    ),
                    "confidence": "High" if len(laps) >= 10 else "Medium",
                    "basis": f"{len(laps)} clean laps",
                })

        # 3 — a car behind, in range, that has already stopped one more time
        behind = by_position.get(row["position"] + 1)
        if behind and isinstance(behind.get("interval"), (int, float)):
            if behind["interval"] <= UNDERCUT_GAP_S and behind["stops"] > row["stops"]:
                signals.append({
                    "driver_number": dn, "driver_code": code, "kind": "UNDERCUT_EXPOSURE",
                    "sort_key": behind["interval"],
                    "headline": f"{code} covered by {behind['code']} at {behind['interval']:.1f}s",
                    "measurement": (
                        f"{behind['code']} is {behind['interval']:.1f}s behind and has made "
                        f"{behind['stops']} stop(s) to {code}'s {row['stops']}. "
                        f"Tyres: {behind['code']} {behind['compound']} "
                        f"{behind['stint_laps']} lap(s), {code} {compound} {stint_laps} lap(s)."
                    ),
                    "confidence": "Medium",
                    "basis": "interval and stop count from the live feed",
                })

        # 4 — the stop is cheap right now, and that is a fact about the track
        if cheap_stop and row["stops"] == 0:
            signals.append({
                "driver_number": dn, "driver_code": code, "kind": "CHEAP_STOP_WINDOW",
                "sort_key": -stint_laps,
                "headline": f"{code} yet to stop, {state.flag} out",
                "measurement": (
                    f"The track is under {state.flag} ({state.flag_source}). {code} has not "
                    f"stopped and is {stint_laps} laps into a {compound} stint. A stop taken "
                    f"under a neutralisation costs less track position than one under green."
                ),
                "confidence": "High",
                "basis": "race control message + stop count",
            })

    # Strongest first within each kind, then the kinds in order of how much they
    # bear on a stop decision, then capped so no one kind fills the panel.
    order = {"CHEAP_STOP_WINDOW": 0, "STINT_LENGTH": 1, "PACE_LOSS": 2, "UNDERCUT_EXPOSURE": 3}
    signals.sort(key=lambda s: (order.get(s["kind"], 9), s.get("sort_key", 0), s["driver_code"]))
    kept: list[dict] = []
    seen = Counter()
    for signal in signals:
        kind = signal["kind"]
        if seen[kind] >= KIND_CAP.get(kind, 3):
            continue
        seen[kind] += 1
        signal.pop("sort_key", None)
        signal["disclaimer"] = "A measured signal, not a prediction of a stop."
        kept.append(signal)
    return kept


# ── practice / qualifying profile ────────────────────────────────────────────
#
# Confirmed against real data (11727, 11728 — Kuala Lumpur FP1/FP2), not
# assumed: segments_sector_1/2/3 and duration_sector_1/2/3 are populated in
# practice and qualifying; intervals is empty in both (0 rows); position is
# populated but is track-running-order, not a ranking by pace, which is why
# the tower below is built from laps alone. OpenF1's own documentation states
# segments are "not available during races" — this whole panel set has no
# equivalent there, by design, not by oversight.
#
# Segment codes, read from OpenF1's docs directly rather than inferred from
# frequency: 0 not available, 2048 yellow, 2049 green, 2051 purple, 2064
# pitlane. These are per *mini*-sector; the sector-level purple/green/yellow
# used below is computed from duration_sector_1/2/3 directly (session-best and
# personal-best), which is the standard timing-tower convention and not the
# same thing as OpenF1's own mini-sector codes.

LONG_RUN_MIN_LAPS = 5


def _driver_laps_detail(state: RaceState, dn: int) -> list[tuple[int, dict]]:
    """(lap_number, detail) for every lap this driver has data for, sorted."""
    return sorted(state.lap_detail.get(dn, {}).items())


def _clean_practice_laps(state: RaceState, dn: int) -> list[int]:
    """Lap numbers for this driver that count as clean: timed, not a pit in/out
    lap, not under a neutralising flag. Same exclusion shape as the post-race
    pace service, applied live."""
    pit = set(state.pit_laps.get(dn, []))
    skip = pit | {l + 1 for l in pit} | state.flag_laps
    return sorted(
        ln for ln, t in state.lap_times.get(dn, {}).items()
        if ln not in skip
    )


def _ideal_lap(state: RaceState, dn: int) -> dict | None:
    """Sum of this driver's own best sector 1 + best sector 2 + best sector 3,
    whether or not they came from the same lap — the standard "theoretical
    best" shown on a timing tower. None until at least one sector time of
    each kind has arrived."""
    bests: dict[str, float] = {}
    for _, detail in _driver_laps_detail(state, dn):
        for key in ("sector1", "sector2", "sector3"):
            v = detail.get(key)
            if isinstance(v, (int, float)) and (key not in bests or v < bests[key]):
                bests[key] = v
    if len(bests) < 3:
        return None
    return {"sector1": bests["sector1"], "sector2": bests["sector2"], "sector3": bests["sector3"],
            "total": round(sum(bests.values()), 3)}


def practice_tower(state: RaceState) -> list[dict]:
    """
    Ranked by best completed lap — never by live position, which during
    practice is track-running order (who happens to be ahead on circuit right
    now), not pace. Gap to P1 is the simple difference in best-lap time.
    """
    with state.lock:
        drivers = list(state.lap_times.keys())

    # session-wide best time per sector, for purple
    session_best: dict[str, float] = {}
    for dn in drivers:
        for ln, detail in _driver_laps_detail(state, dn):
            for key in ("sector1", "sector2", "sector3"):
                v = detail.get(key)
                if isinstance(v, (int, float)) and (key not in session_best or v < session_best[key]):
                    session_best[key] = v

    rows: list[dict] = []
    for dn in drivers:
        best_lap = None
        best_time = None
        for ln, t in state.lap_times.get(dn, {}).items():
            if best_time is None or t < best_time:
                best_lap, best_time = ln, t
        if best_time is None:
            continue

        d = state.drivers.get(dn, {})
        st = state.current_stint(dn)
        detail = state.lap_detail.get(dn, {}).get(best_lap, {})

        # personal best per sector, for green (independent of which lap the
        # overall best-lap time came from — a driver can improve sector 2 on a
        # lap that is not their fastest overall)
        personal_best: dict[str, float] = {}
        for _, det in _driver_laps_detail(state, dn):
            for key in ("sector1", "sector2", "sector3"):
                v = det.get(key)
                if isinstance(v, (int, float)) and (key not in personal_best or v < personal_best[key]):
                    personal_best[key] = v

        sectors = {}
        for key in ("sector1", "sector2", "sector3"):
            v = detail.get(key)
            if v is None:
                colour = None
            elif session_best.get(key) is not None and v <= session_best[key]:
                colour = "purple"
            elif personal_best.get(key) is not None and v <= personal_best[key]:
                colour = "green"
            else:
                colour = "yellow"
            sectors[key] = {"time": v, "colour": colour}

        clean_laps = _clean_practice_laps(state, dn)
        rows.append({
            "driver_number": dn,
            "code": d.get("code", f"D{dn}"),
            "full_name": d.get("full_name"),
            "team": d.get("team"),
            "colour": d.get("colour"),
            "best_lap_number": best_lap,
            "best_lap_s": best_time,
            "sectors": sectors,
            "speed_traps": {key: detail.get(key) for key in ("i1_speed", "i2_speed", "st_speed")},
            "segments": {key: detail.get(key) for key in ("seg1", "seg2", "seg3")},
            "ideal_lap": _ideal_lap(state, dn),
            "laps": len(state.lap_times.get(dn, {})),
            "clean_laps": len(clean_laps),
            "compound": st.get("compound"),
            "tyre_age": st.get("tyre_age_at_start"),
            "stops": len(state.pit_laps.get(dn, [])),
        })

    rows.sort(key=lambda r: r["best_lap_s"])
    p1_time = rows[0]["best_lap_s"] if rows else None
    for i, r in enumerate(rows, start=1):
        r["position"] = i
        r["gap_to_p1"] = None if p1_time is None else round(r["best_lap_s"] - p1_time, 3)
    return rows


def clean_lap_pace(state: RaceState, lists: dict) -> list[dict]:
    """
    Median clean-lap pace per driver — the same computation and the same
    exclusions as the post-race True Pace service (pit in/out, SC/VSC/yellow,
    statistical outliers, no-timing), run live. Deliberately not called "true
    pace" here: that name is the finished-race product, with a grid and a
    finishing order behind it to compare against. This is the same filter
    applied to a session that has neither.
    """
    from app.services.pace_service import compute_true_pace

    drivers_raw = lists.get("v1/drivers") or [
        {"driver_number": dn, "name_acronym": d.get("code")} for dn, d in state.drivers.items()
    ]
    try:
        rows = compute_true_pace(
            lists["v1/laps"], lists["v1/stints"], lists["v1/pit"],
            lists["v1/race_control"], drivers_raw,
        )
    except Exception:
        return []
    return [
        {
            "driver_number": r.driver_number, "code": r.driver_code,
            "median_clean_lap_s": r.median_clean_lap, "fastest_clean_lap_s": r.fastest_clean_lap,
            "sample_size": r.sample_size, "confidence": r.confidence,
        }
        for r in sorted(rows, key=lambda r: r.median_clean_lap)
    ]


def long_run_pace(state: RaceState) -> list[dict]:
    """
    One row per driver's longest run of LONG_RUN_MIN_LAPS or more *consecutive*
    clean laps — a race-sim stint, not the whole session's pace. Confidence is
    the same sample-size scale as everywhere else in this project (High ≥12,
    Medium ≥6, Low otherwise); a run under LONG_RUN_MIN_LAPS is not reported
    at all, since "a long run" is the claim being made.
    """
    from app.utils.statistics import confidence_from_sample, median

    out: list[dict] = []
    for dn in list(state.lap_times.keys()):
        clean = set(_clean_practice_laps(state, dn))
        if not clean:
            continue
        ordered = sorted(clean)
        runs: list[list[int]] = []
        current: list[int] = []
        for ln in ordered:
            if current and ln != current[-1] + 1:
                runs.append(current)
                current = []
            current.append(ln)
        if current:
            runs.append(current)
        candidates = [r for r in runs if len(r) >= LONG_RUN_MIN_LAPS]
        if not candidates:
            continue
        best_run = max(candidates, key=len)
        times = [state.lap_times[dn][ln] for ln in best_run]
        st = state.current_stint(dn)
        d = state.drivers.get(dn, {})
        out.append({
            "driver_number": dn, "code": d.get("code", f"D{dn}"),
            "lap_start": best_run[0], "lap_end": best_run[-1],
            "laps": len(best_run),
            "median_s": round(median(times), 3),
            "compound": st.get("compound"),
            "confidence": confidence_from_sample(len(best_run)),
        })
    out.sort(key=lambda r: r["median_s"])
    return out


def session_timeline(state: RaceState) -> dict:
    """
    The session by its own clock — flag bands (green/yellow/SC/VSC/red), rain
    markers, and a marker for every session-best lap improvement in the order
    it happened. Used by every profile: race gets the same bands this already
    was before Block 25 (state.flag_periods, read here rather than recomputed
    a second way), and practice/qualifying get it as their primary timeline,
    since they have no race-distance axis to plot one against.

    SC/VSC genuinely happens almost only in a race — a safety car protects
    track workers clearing an incident during competitive running, which
    practice and qualifying rarely produce — so no profile-specific folding is
    applied; the flag is reported exactly as race control called it, for
    every profile alike.

    Lap-indexed would be wrong for practice/qualifying specifically: drivers
    are never on the same lap at the same time there, so "lap 14" names a
    different moment for every car. The session clock is the one axis every
    driver shares, in any profile.
    """
    bands = [
        {"flag": p["flag"], "start": iso(p["start"]), "end": iso(p["end"]), "duration_s": p["duration_s"]}
        for p in state.flag_periods
    ]
    if state.flag_since is not None:
        now = state.clock()
        bands.append({"flag": state.flag, "start": iso(state.flag_since), "end": iso(now),
                      "duration_s": round(now - state.flag_since, 1)})

    markers: list[dict] = []
    try:
        from app.services import weather_conditions
        lists = state.lists()
        periods = weather_conditions.detect_rain_periods(lists["v1/weather"], lists["v1/laps"])
        for p in periods:
            markers.append({"type": "RAIN", "at": p.start.isoformat() if hasattr(p.start, "isoformat") else str(p.start)})
    except Exception:
        pass

    # Every completed lap, in the true order it happened — not grouped by
    # driver, which would compare "best so far" across laps that did not
    # actually arrive in that order and misdate or miss an improvement.
    # Undated laps (recv not recorded — e.g. a cached session fed through
    # replay()'s invented order) sort last rather than crash, and are still
    # included: a session-best is still real even if its moment is unknown.
    all_laps = [
        (state.lap_completed_at.get(dn, {}).get(ln), dn, ln, t)
        for dn, by_lap in state.lap_times.items()
        for ln, t in by_lap.items()
    ]
    all_laps.sort(key=lambda row: (row[0] is None, row[0]))

    best_so_far: float | None = None
    for at, dn, ln, t in all_laps:
        if best_so_far is None or t < best_so_far:
            best_so_far = t
            markers.append({
                "type": "SESSION_BEST", "driver_number": dn,
                "code": state.drivers.get(dn, {}).get("code", f"D{dn}"),
                "lap_number": ln, "time_s": t,
                "at": iso(at) if at is not None else None,
            })
    markers.sort(key=lambda m: m.get("at") or "")
    return {"bands": bands, "markers": markers}


def practice_notes(state: RaceState, tower: list[dict], long_runs: list[dict]) -> list[dict]:
    """
    Deterministic engineer notes for practice/qualifying. Same rule as the
    race profile's _notes(): thresholds over measured values, template text,
    no model, no causal language ("X because Y") — only what was observed and
    when. Time-stamped, not lap-stamped, for the reason session_timeline()
    gives: there is no shared lap axis to stamp a note to.
    """
    notes: list[dict] = []
    now = iso(state.clock())

    def note(kind: str, severity: str, title: str, message: str) -> None:
        notes.append({
            "id": f"{kind}-{len(notes)}-{now}", "at": now, "type": kind,
            "severity": severity, "title": title, "message": message,
        })

    if state.flag in (FLAG_SC, FLAG_VSC, FLAG_RED):
        note("TRACK_STATUS", "High", f"{state.flag} on track",
             f"{state.flag}. Race control: \"{state.flag_source}\".")
    elif state.flag == FLAG_YELLOW:
        note("TRACK_STATUS", "Medium", "Local yellow",
             f"Sector yellow. Race control: \"{state.flag_source}\".")

    if tower:
        leader = tower[0]
        note("BEST_LAP", "High", f"{leader['code']} leads on pace",
             f"{leader['code']} — {leader['best_lap_s']:.3f}s on lap {leader['best_lap_number']}, "
             f"the best of the session so far.")

    for run in long_runs[:3]:
        # No promotion below the sample-size scale's High bar for anything
        # that reads as a degradation claim — a long run's own pace is always
        # shown (it is a measurement, not an inference), but this project's
        # rule (decisions_service.DECISION_MIN_CONFIDENCE) is that a trend
        # claim needs High confidence, so none is made here below it.
        note("LONG_RUN", "Medium" if run["confidence"] != "High" else "High",
             f"{run['code']} long run: {run['laps']} laps",
             f"{run['code']} — {run['laps']} consecutive clean laps on {run['compound'] or 'unknown tyres'} "
             f"(laps {run['lap_start']}-{run['lap_end']}), median {run['median_s']:.3f}s. "
             f"Confidence: {run['confidence']}.")

    # Most recent compound changes only (by the lap their new stint started) —
    # a session well under way has every driver past stint 1, and listing all
    # of them on every poll buries everything else in the note list.
    changes = []
    for dn, by_number in state.stints.items():
        if not by_number:
            continue
        latest = by_number[max(by_number)]
        if latest.get("stint_number", 1) > 1:
            changes.append((dn, latest))
    changes.sort(key=lambda dc: dc[1].get("lap_start") or 0, reverse=True)
    for dn, latest in changes[:3]:
        d = state.drivers.get(dn, {})
        note("COMPOUND_CHANGE", "Medium", f"{d.get('code', f'D{dn}')} changed compound",
             f"{d.get('code', f'D{dn}')} now on {latest.get('compound', 'unknown')} "
             f"(stint {latest.get('stint_number')}).")

    return notes


def _notes(state: RaceState, chaos: dict, pit: dict) -> list[dict]:
    """
    Deterministic engineer notes. Thresholds over measured values, template
    text, no model in the loop — the same rule as the post-race notes_service.
    """
    notes: list[dict] = []
    lap = state.current_lap

    def note(kind: str, severity: str, title: str, message: str, confidence: str = "High") -> None:
        notes.append({
            "id": f"{kind}-{lap}-{len(notes)}", "lap_number": lap, "type": kind,
            "severity": severity, "title": title, "message": message, "confidence": confidence,
        })

    if state.flag in (FLAG_SC, FLAG_VSC, FLAG_RED):
        note("TRACK_STATUS", "High", f"{state.flag} on track",
             f"Lap {lap} — {state.flag}. Race control: \"{state.flag_source}\". "
             f"{len(state.flag_laps)} lap(s) neutralised so far.")
    elif state.flag == FLAG_YELLOW:
        note("TRACK_STATUS", "Medium", "Local yellow",
             f"Lap {lap} — sector yellow. Race control: \"{state.flag_source}\".")

    for c in pit.get("cycles", [])[-2:]:
        if c["status"] == "closed":
            note("PIT_CYCLE", "Medium" if not c["neutralised"] else "High",
                 f"Pit cycle {c['cycle_id']} read", c["summary"])
        else:
            note("PIT_CYCLE", "Low", f"Pit cycle {c['cycle_id']} in progress", c["summary"],
                 confidence="Low")

    if chaos and chaos.get("score") is not None and chaos.get("breakdown"):
        top = max(chaos["breakdown"], key=lambda b: b["points"], default=None)
        if top and top["points"] > 0:
            note("CHAOS", "Medium",
                 f"{chaos['label']} {chaos['score']}/100",
                 f"Lap {lap} — {chaos['label'].lower()} {chaos['score']}/100 over "
                 f"{chaos['denominator_laps']} lap(s). Largest contributor: "
                 f"{top['component'].replace('_', ' ')} ({top['points']} of {top['weight']} points; "
                 f"{top['note']}). {chaos['caveat']}",
                 confidence="Medium" if not chaos["final"] else "High")

    leaders = state.tower()[:3]
    if len(leaders) >= 2 and isinstance(leaders[1].get("interval"), (int, float)):
        if leaders[1]["interval"] <= 1.0:
            note("BATTLE", "Medium", f"{leaders[1]['code']} within DRS of {leaders[0]['code']}",
                 f"Lap {lap} — {leaders[1]['code']} is {leaders[1]['interval']:.3f}s behind "
                 f"{leaders[0]['code']} for the lead. Interval from the live feed, "
                 f"sampled at about 4s resolution.")

    feed = state.feed_health()
    if feed["stale"]:
        note("FEED", "High", "Live feed is stale",
             f"No message on any topic for {feed['last_message_age_s']}s. "
             f"Everything below is the last known state, not the current one.")
    return notes


def _weather_panel(state: RaceState, lists: dict, laps: list[dict]) -> dict:
    """
    Air/track temperature, trend and rain — shared by both profiles. The
    MIN_WET_RECORDS=3 lag is structural (weather_conditions.py), not a
    live-only approximation: a rain period only exists once 3 wet records have
    arrived, and records are published roughly once a minute, so a shower is
    real on the ground for about 3 minutes before this panel can say so.
    """
    from app.services import weather_conditions

    weather = lists["v1/weather"]
    latest = weather[-1] if weather else {}
    trend = None
    if len(weather) >= 2:
        a, b = weather[-2].get("track_temperature"), weather[-1].get("track_temperature")
        if isinstance(a, (int, float)) and isinstance(b, (int, float)):
            trend = "rising" if b > a else "falling" if b < a else "steady"
    periods = weather_conditions.detect_rain_periods(weather, laps)
    idx = weather_conditions.lap_time_index(laps)
    wet = weather_conditions.wet_lap_numbers(periods, idx)
    return {
        "ok": True,
        "air_temperature": latest.get("air_temperature"),
        "track_temperature": latest.get("track_temperature"),
        "track_temperature_trend": trend,
        "rainfall": latest.get("rainfall"),
        "rain_periods": len(periods), "wet_laps": sorted(wet),
        "laps_indexed": len(idx),
        "note": "a rain period is only counted once MIN_WET_RECORDS (3) wet records have "
                "arrived — weather updates roughly once a minute, so this panel runs "
                "about 3 minutes behind the rain actually starting on the ground",
    }


def live_analysis(state: RaceState) -> dict:
    """
    Run the real services on the partial snapshot. Each block is isolated: a
    failure is reported, never raised, and the reason is carried into the
    payload so a limitation is visible in the UI instead of hidden.

    Branches on state.profile. Race keeps the exact behaviour this module had
    before Block 25 — chaos, pit cycles, pit watch, lap-indexed notes.
    Practice and qualifying get their own panel set: session_status instead of
    chaos (there is no race distance to score), a pace-ranked tower instead of
    a pit cycle analysis, and time-indexed notes.
    """
    lists = state.lists()
    laps = lists["v1/laps"]
    out: dict[str, Any] = {
        "profile": state.profile,
        "inputs": {k.replace("v1/", ""): len(v) for k, v in lists.items()},
        "notes": [], "pit_watch": [], "chaos": None,
    }

    try:
        out["weather"] = _weather_panel(state, lists, laps)
    except Exception as exc:
        out["weather"] = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}

    # Session-clock timeline — every profile gets it (distinct from the "timeline"
    # key below, which is build_race_timeline's own lap-indexed object and exists
    # only for the race profile). SC/VSC bands are real information for race and
    # essentially never occur in practice/qualifying, so no profile-specific
    # folding is applied — the flag is simply reported as it happened.
    try:
        out["session_timeline"] = session_timeline(state)
    except Exception as exc:
        out["session_timeline"] = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}

    if state.profile != "race":
        try:
            out["session_status"] = state.session_status()
        except Exception as exc:
            out["session_status"] = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
        try:
            out["practice_tower"] = practice_tower(state)
        except Exception as exc:
            out["practice_tower"] = []
            out["practice_tower_error"] = f"{type(exc).__name__}: {exc}"
        try:
            out["pace"] = clean_lap_pace(state, lists)
        except Exception as exc:
            out["pace"] = []
            out["pace_error"] = f"{type(exc).__name__}: {exc}"
        long_runs: list[dict] = []
        try:
            long_runs = long_run_pace(state)
            out["long_runs"] = long_runs
        except Exception as exc:
            out["long_runs"] = []
            out["long_runs_error"] = f"{type(exc).__name__}: {exc}"
        try:
            out["notes"] = practice_notes(state, out.get("practice_tower") or [], long_runs)
        except Exception as exc:
            out["notes_error"] = f"{type(exc).__name__}: {exc}"
        return out

    # ── race profile — unchanged from before Block 25 ───────────────────────
    from app.services.timeline_builder import build_race_timeline

    timeline = None
    try:
        timeline = build_race_timeline(
            laps_data=laps, weather_data=lists["v1/weather"],
            race_control_data=lists["v1/race_control"], pit_data=lists["v1/pit"],
            interval_data=lists["v1/intervals"], position_data=lists["v1/position"],
            session_key=state.session_key or 0,
        )
        out["timeline"] = {"ok": True, "total_laps": timeline.total_laps}
    except Exception as exc:
        out["timeline"] = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}

    chaos = None
    if timeline is not None:
        try:
            chaos = _chaos(state, timeline, lists)
            out["chaos"] = chaos
        except Exception as exc:
            out["chaos"] = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}

    pit: dict = {"cycles": []}
    if timeline is not None:
        try:
            pit = _pit(state, timeline, lists)
            out["pit"] = {"ok": True, **pit}
        except Exception as exc:
            out["pit"] = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}

    try:
        out["pit_watch"] = _pit_watch(state)
    except Exception as exc:
        out["pit_watch_error"] = f"{type(exc).__name__}: {exc}"

    try:
        out["notes"] = _notes(state, chaos if isinstance(chaos, dict) and "score" in chaos else None, pit)
    except Exception as exc:
        out["notes_error"] = f"{type(exc).__name__}: {exc}"

    return out


# ── replay ───────────────────────────────────────────────────────────────────

def load_capture(capture_dir: str | Path) -> list[tuple[float, str, dict]]:
    """
    Every recorded message, in arrival order.

    The recorder writes one JSONL per topic, each line
    ``{"_recv": float, "_recv_iso": str, "topic": str, "msg": {...}}``.
    ``_recv`` is the moment the message reached the recorder, which is the only
    ordering a subscriber ever had — so it is the ordering replayed. The
    per-topic ``date`` fields are not: they are the moments the *events*
    happened, and OpenF1 publishes them out of order.
    """
    d = Path(capture_dir)
    if not d.is_dir():
        raise SystemExit(f"no capture at {d}")
    events: list[tuple[float, str, dict]] = []
    for path in sorted(d.glob("*.jsonl")):
        if path.name.startswith("_"):        # _events.jsonl is the recorder's own log
            continue
        with path.open() as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue                  # a truncated last line if the recorder was killed
                msg, topic, recv = rec.get("msg"), rec.get("topic"), rec.get("_recv")
                if isinstance(msg, dict) and topic in TOPICS and isinstance(recv, (int, float)):
                    events.append((float(recv), topic, msg))
    events.sort(key=lambda e: e[0])
    return events


def replay_capture(
    capture_dir: str | Path,
    state: RaceState,
    speed: float = 1.0,
    until_lap: int | None = None,
    on_tick: Callable[[RaceState, int], None] | None = None,
    max_sleep_s: float = 3600.0,
) -> dict:
    """
    Play a recorded capture back into ``state`` at ``speed``× real time.

    The inter-arrival times are preserved, divided by ``speed``: at 1.0 the
    Baku capture takes the three hours it originally took; at 200 it takes
    about a minute. Either way the *shape* is the original — including the
    28.6-second hole at 12:15:04, when the broker dropped the recorder and the
    reconnect needed a fresh token. At speed 200 that hole is 0.14s, which is
    too short to see, so ``--hold-gaps`` (below) replays holes in real time.

    Nothing is skipped and nothing is reordered: replaying is the same
    ``ingest()`` the MQTT client calls, so an upsert here is an upsert there.
    """
    events = load_capture(capture_dir)
    if not events:
        return {"events": 0}

    t0_wall, t0_feed = time.time(), events[0][0]
    # "Now" follows the recording, not the machine. Paced, that is the wall
    # clock scaled; unpaced, it is simply the last message's arrival time.
    # Without this every driver looks retired and every feed gap looks like an
    # outage, because the recording is in the past.
    cursor = {"t": t0_feed}
    state.clock = (
        (lambda: t0_feed + (time.time() - t0_wall) * speed) if speed > 0
        else (lambda: cursor["t"])
    )
    state.started = t0_feed
    fed = 0
    for recv, topic, msg in events:
        if speed > 0:
            due = t0_wall + (recv - t0_feed) / speed
            delay = due - time.time()
            if delay > 0:
                time.sleep(min(delay, max_sleep_s))
        cursor["t"] = recv
        state.ingest(topic, msg, recv=recv)
        fed += 1
        if on_tick and fed % 2000 == 0:
            on_tick(state, fed)
        if until_lap and state.current_lap >= until_lap:
            break
    return {
        "events": len(events),
        "events_fed": fed,
        "span_s": round(events[-1][0] - events[0][0], 1),
        "reached_lap": state.current_lap,
        "gaps_observed": state.gaps,
    }


def replay(session_key: int, state: RaceState, until_lap: int | None = None,
           speed: float = 0.0, on_tick=None) -> dict:
    """
    Feed a *cached REST session* into the snapshot in the order MQTT would
    have delivered it. Kept for sessions with no capture; a capture is
    strictly better, because this has to invent the arrival order.

    The endpoints do not share a timestamp field: position/pit/race_control/
    weather/intervals/team_radio carry `date`, laps carry `date_start`, stints
    carry only `lap_start`, and drivers carry nothing. So laps are ordered by
    date_start, stints are placed at the start time of their first lap, and
    drivers (session setup) are fed first.
    """
    cache_dir = Path("cache") / str(session_key)
    if not cache_dir.is_dir():
        raise SystemExit(f"no cached session at {cache_dir}")

    meta_path = cache_dir / "_session_meta.json"
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text())
            state.set_session_meta(meta.get("session_type"), meta.get("session_name"),
                                   meta.get("location"))
        except (OSError, json.JSONDecodeError):
            pass

    raw: dict[str, list[dict]] = {}
    for topic in TOPICS:
        p = cache_dir / f"{topic.replace('v1/', '')}.json"
        if p.exists():
            data = json.loads(p.read_text())
            if isinstance(data, list):
                raw[topic] = [r for r in data if isinstance(r, dict)]

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
    for rec in raw.get("v1/drivers", []):
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
    ap = argparse.ArgumentParser(description="RaceState snapshot + live-analysis probe.")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--replay-capture", metavar="DIR", help="a recorder capture directory")
    src.add_argument("--replay", type=int, metavar="SESSION_KEY", help="a cached REST session")
    ap.add_argument("--speed", type=float, default=0.0,
                    help="capture replay speed multiplier; 0 = as fast as possible")
    ap.add_argument("--until-lap", type=int, default=0)
    ap.add_argument("--dump", metavar="FILE", help="write the full snapshot JSON here")
    ap.add_argument("--session-type", metavar="TYPE",
                    help='override the profile — "Practice", "Qualifying" or "Race". '
                         '--replay reads this from _session_meta.json automatically; '
                         '--replay-capture has no such file, so a capture needs this to '
                         'get anything but the race profile.')
    args = ap.parse_args()

    state = RaceState()
    if args.replay_capture:
        info = replay_capture(args.replay_capture, state, speed=args.speed,
                              until_lap=args.until_lap or None)
        print(f"capture {args.replay_capture}: fed {info['events_fed']} of {info['events']} "
              f"events spanning {info['span_s']}s, reached lap {info['reached_lap']}")
        for g in info["gaps_observed"]:
            print(f"  feed gap {g['seconds']}s at lap {g['at_lap']} ({g['from'][11:19]} → {g['to'][11:19]})")
    else:
        info = replay(args.replay, state, until_lap=args.until_lap or None)
        print(f"replay {args.replay}: fed {info['events_fed']} of {info['events_available']} events, "
              f"reached lap {info['reached_lap']}")

    if args.session_type:
        state.set_session_meta(args.session_type, state.session_name, state.location)

    snap = state.snapshot()
    ts = snap["track_status"]
    print(f"\nprofile={snap['profile']} (session_type={snap['session_type']!r}) · "
          f"{snap.get('location') or '?'} · {snap.get('session_name') or '?'}")
    print(f"flag={ts['flag']} ({ts['source'][:60]}) · drivers={snap['drivers_known']} · "
          f"lap={snap['current_lap']} · distance={snap['race_distance']} ({snap['race_distance_source']})")
    print(f"documents: {snap['feed']['documents']}")

    if snap["profile"] == "race":
        print("\ntop of the order:")
        for row in snap["tower"][:6]:
            print(f"  P{row['position']:<2} {row['code']:<4} lap {str(row['lap_number']):<3} "
                  f"gap {str(row['gap_to_leader']):<8} {str(row['compound']):<7} "
                  f"stint {row['stint_number']} ({row['stint_laps']} laps)")
        c = snap.get("chaos") or {}
        print(f"\n{c.get('label')}: {c.get('score')} level={c.get('level')} "
              f"over {c.get('denominator_laps')} lap(s)")
        p = snap["analysis"].get("pit", {})
        print(f"pit: {p.get('stops')} stops, {len(p.get('cycles', []))} cycles, "
              f"{p.get('open_cycles')} in progress")
        print("\npit window watch:")
        for s in snap["pit_watch"][:6]:
            print(f"  [{s['confidence']:<6}] {s['kind']:<18} {s['headline']}")
    else:
        print("\nbest laps:")
        for row in snap["practice_tower"][:6]:
            gap = row["gap_to_p1"]
            print(f"  P{row['position']:<2} {row['code']:<4} {row['best_lap_s']:.3f}s "
                  f"(+{gap:.3f}) lap {row['best_lap_number']:<3} {str(row['compound']):<7} "
                  f"{row['clean_laps']} clean laps")
        ss = snap.get("session_status") or {}
        print(f"\nsession status: flag={ss.get('flag')} · red flags={ss.get('red_flags')} · "
              f"{ss.get('minutes_under_red')} min under red")
        print("\nlong runs:")
        for r in snap["long_runs"][:5]:
            print(f"  [{r['confidence']:<6}] {r['code']:<4} {r['laps']} laps "
                  f"({r['lap_start']}-{r['lap_end']}) median {r['median_s']:.3f}s on {r['compound']}")

    print("\nnotes:")
    for n in snap["notes"]:
        print(f"  [{n['severity']:<6}] {n['title']}")
    if args.dump:
        Path(args.dump).write_text(json.dumps(snap, indent=1, default=str), encoding="utf-8")
        print(f"\nsnapshot: {args.dump}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
