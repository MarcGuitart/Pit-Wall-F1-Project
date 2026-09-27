"""
Which finished races may be published automatically, and when.

Publication means committing a computed _analysis.json to this repo: Render
declares no disk, so the cache is baked into the image and a commit is the only
way a new race reaches the site. That makes a premature publication expensive —
it ships a half-race analysis to production and needs a second commit to undo.

So a session is published only when all three of these hold:

  clock       now is past date_end plus the unlock buffer /analysis already
              uses, so the two gates cannot disagree.
  chequered   race_control carries a CHEQUERED FLAG message. The clock alone is
              not enough: date_end is the *scheduled* end, and a red flag pushes
              the real one past it.
  stable laps the lap count is the same as it was on the previous run. A race
              still being written to grows; a finished one does not. This is the
              condition that catches the case the other two miss — a session
              whose feed is still catching up half an hour after the flag.

Any one missing means "not yet".

Two things about the lap-count condition, both learnt from running this against
the real 2026 season:

  A first observation is not a failure. There is nothing to compare against on
  the run that first sees a session, so it waits one run. That is a wait, never
  "stuck".

  Past STUCK_AFTER, a feed is not catching up any more. A session that is that
  far beyond its end, with a chequered flag and laps on record, is settled: the
  stability comparison has nothing left to protect against, and requiring it
  would make every race in the back catalogue wait two runs for no reason.

STUCK_AFTER is therefore the point where "not yet" stops meaning "wait": a
session past it with no chequered flag or no laps at all has a data problem, not
a timing one, and is reported instead of waited on.

Two of those exist, and neither is a data problem: Sakhir and Jeddah 2026 were
cancelled, so there is no race to wait for. Two independent guards keep them out
of the candidate list, because one of them depends on a third party:

  is_cancelled   OpenF1 /sessions carries the flag, and it is true for both. A
                 cancelled session is never a candidate. This needs no
                 maintenance and covers every future cancellation.
  exclusions     backend/excluded_sessions.json, session_key plus a written
                 reason, versioned and reviewed like code. It is the escape
                 hatch for a session that will never settle for a reason OpenF1
                 does not express.

Everything here is a pure function over already-fetched documents. The network,
the file, the git commit and the notifications live in scripts/autopublish.py.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.utils.time import parse_utc, session_end, unlock_buffer

# "CHEQUERED FLAG" contains the substring "RED FLAG". Matching flags by
# substring has produced a bug in this repo twice; every flag match is
# word-bounded, and stays that way.
CHEQUERED = re.compile(r"\bCHEQUERED\b", re.IGNORECASE)

# Past this much after the end of a session, "not ready" stops meaning "wait".
STUCK_AFTER = timedelta(hours=6)

# A run publishes at most this many sessions. Each one is a commit that triggers
# a production deploy, and a run that publishes a whole weekend at once makes
# any mistake in it that much harder to read back.
MAX_PER_RUN = 2

# Sprints and grands prix both carry session_type "Race" in OpenF1; the name is
# what differs. Both are published.
RACE_SESSION_TYPE = "Race"

# Versioned, edited by hand. Read by scripts/autopublish.py, which passes the
# result in — this module stays a set of pure functions over documents.
EXCLUSIONS_FILE = "excluded_sessions.json"


@dataclass(frozen=True)
class Candidate:
    session_key: int
    session_name: str
    circuit: str
    year: int
    date_start: str
    date_end: str | None

    @property
    def label(self) -> str:
        return f"{self.circuit} {self.year} · {self.session_name}"

    def end(self) -> datetime:
        """The end the gate uses — published date_end, or the type estimate."""
        end, _source = session_end(self.date_start, RACE_SESSION_TYPE, self.date_end)
        return end


@dataclass(frozen=True)
class Readiness:
    clock: bool
    chequered: bool
    stable_laps: bool
    lap_count: int
    previous_lap_count: int | None
    stuck: bool
    settled: bool = False       # stability waived: far past the end, data present

    @property
    def ready(self) -> bool:
        return self.clock and self.chequered and self.stable_laps

    def missing(self) -> list[str]:
        return [name for name, ok in (
            ("clock", self.clock),
            ("chequered", self.chequered),
            ("stable_laps", self.stable_laps),
        ) if not ok]

    def why(self) -> str:
        """One line, for a log, an issue body or a Telegram message."""
        if self.ready:
            how = "settled long ago" if self.settled else f"lap count held at {self.lap_count}"
            return f"ready — {self.lap_count} laps, chequered seen, past the buffer, {how}"
        parts = []
        if not self.clock:
            parts.append("still inside the unlock buffer")
        if not self.chequered:
            parts.append("no CHEQUERED FLAG in race_control")
        if not self.stable_laps:
            if self.previous_lap_count is None:
                parts.append(f"first observation ({self.lap_count} laps) — needs a second run to compare")
            elif self.lap_count == 0:
                parts.append("no laps in the feed")
            else:
                parts.append(f"lap count still moving ({self.previous_lap_count} → {self.lap_count})")
        return "; ".join(parts)


def is_race_session(meta: dict) -> bool:
    return (meta.get("session_type") or "") == RACE_SESSION_TYPE


def is_cancelled(meta: dict) -> bool:
    """
    OpenF1 marks a cancelled session with is_cancelled: true.

    Read strictly: only the boolean True excludes. A missing field means the
    session predates the flag or the endpoint changed shape, and that must read
    as "not cancelled" — defaulting the other way would silently stop
    publishing the whole season.
    """
    return meta.get("is_cancelled") is True


def parse_exclusions(data: dict | None) -> dict[int, str]:
    """{session_key: reason} from the contents of excluded_sessions.json."""
    rows = (data or {}).get("excluded") or []
    out: dict[int, str] = {}
    for row in rows:
        key = row.get("session_key")
        if isinstance(key, int):
            label = row.get("label") or f"session {key}"
            out[key] = f"{label}: {row.get('reason') or 'no reason recorded'}"
    return out


def has_chequered(race_control: list[dict]) -> bool:
    for row in race_control or []:
        for field in ("message", "flag"):
            value = row.get(field)
            if isinstance(value, str) and CHEQUERED.search(value):
                return True
    return False


def lap_count(laps: list[dict]) -> int:
    """Highest lap_number seen, not len(laps): one row per driver per lap."""
    numbers = [row.get("lap_number") for row in laps or []]
    return max((n for n in numbers if isinstance(n, int)), default=0)


def select_candidates(
    sessions: list[dict],
    done_keys: set[int],
    now: datetime | None = None,
    year: int | None = None,
    excluded: dict[int, str] | None = None,
) -> list[Candidate]:
    """
    Race sessions of `year` that have started and are not already published,
    oldest end first. A session that has not started yet is not a candidate;
    one that is mid-race is, and fails the readiness check instead — that is
    where "not yet" is decided, so the reason is reported rather than hidden.

    Cancelled and excluded sessions are dropped here rather than failing the
    readiness check, because they are not waiting for anything: leaving them in
    would file an issue an hour, for ever, about a race that did not happen.
    """
    now = now or datetime.now(timezone.utc)
    year = year if year is not None else now.year
    excluded = excluded or {}
    out: list[Candidate] = []
    for meta in sessions:
        if not is_race_session(meta):
            continue
        if meta.get("year") != year:
            continue
        key = meta.get("session_key")
        if not isinstance(key, int) or key in done_keys:
            continue
        if is_cancelled(meta) or key in excluded:
            continue
        date_start = meta.get("date_start")
        started = parse_utc(date_start)
        if started is None or started > now:
            continue
        out.append(Candidate(
            session_key=key,
            session_name=meta.get("session_name") or RACE_SESSION_TYPE,
            circuit=meta.get("circuit_short_name") or meta.get("country_name") or "?",
            year=meta["year"],
            date_start=date_start,
            date_end=meta.get("date_end"),
        ))
    out.sort(key=lambda c: (c.end(), c.session_key))
    return out


def readiness(
    candidate: Candidate,
    race_control: list[dict],
    laps: list[dict],
    previous_lap_count: int | None,
    now: datetime | None = None,
) -> Readiness:
    now = now or datetime.now(timezone.utc)
    end = candidate.end()
    long_past = now >= end + STUCK_AFTER

    laps_now = lap_count(laps)
    clock = now >= end + unlock_buffer()
    chequered = has_chequered(race_control)

    held = previous_lap_count is not None and previous_lap_count == laps_now
    settled = long_past and chequered and laps_now > 0
    stable = laps_now > 0 and (held or settled)

    ready = clock and chequered and stable
    # Stuck is a data problem, not a wait. A first observation and a lap count
    # that moved since the last run are both waits, however long ago the race
    # was: the next run resolves them. No chequered flag or no laps at all this
    # far past the end will not resolve itself.
    stuck = long_past and not ready and (not chequered or laps_now == 0)

    return Readiness(
        clock=clock,
        chequered=chequered,
        stable_laps=stable,
        lap_count=laps_now,
        previous_lap_count=previous_lap_count,
        stuck=stuck,
        settled=settled and not held,
    )


def publishable(ready: list[Candidate], limit: int = MAX_PER_RUN) -> tuple[list[Candidate], list[Candidate]]:
    """
    (publish now, deferred to the next run) — oldest first, `limit` at a time.

    limit=0 means no cap, not "publish nothing": it is the backfill, where an
    explicit list of sessions is published in one run and one commit. A plain
    ready[:0] would silently publish nothing at all, which is the one reading
    that looks like success and is not.
    """
    if limit <= 0:
        return list(ready), []
    return ready[:limit], ready[limit:]


def is_published(analysis: dict | None, current_version: str) -> bool:
    """
    A session counts as done only if its analysis carries the current
    ANALYSIS_VERSION. An analysis from an older pipeline is not "already
    published" — it is stale, and re-running the publication is how it gets
    brought forward.
    """
    if not analysis:
        return False
    return analysis.get("analysis_version") == current_version
