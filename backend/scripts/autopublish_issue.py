"""
Open or update a GitHub issue for a session that will not settle.

    REPORT='{"stuck":[...]}' python scripts/autopublish_issue.py

Uses the `gh` CLI, which is on every GitHub runner and authenticated by
GH_TOKEN. One issue per session, ever: six hours of hourly runs leave one issue
with a comment per run, not six issues.

Finding the existing one does not go through GitHub's search index. `gh issue
list --search '"title" in:title'` looked right and is not reliable enough to
build on: the index is eventually consistent, so an issue created ten minutes
ago may not be findable yet, and the titles here contain a "·" that the query
parser is free to interpret. Two runs close together — the hourly cron and a
manual dispatch — would each miss the other's issue and file a second. So the
issues are listed and matched on the exact title in this process, where the
comparison is a string comparison and nothing else.

A closed issue is reopened rather than duplicated. Closing one is not how a
session is silenced — backend/excluded_sessions.json is, and the issue body says
so. An unexplained stuck session should keep asking.

Never exits non-zero: a failure to file an issue must not fail a run that
published other sessions correctly. The report is printed either way.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys


def gh(*args: str) -> tuple[int, str]:
    try:
        p = subprocess.run(("gh",) + args, capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return 1, f"{type(exc).__name__}: {exc}"
    return p.returncode, (p.stdout or p.stderr).strip()


def title_for(s: dict) -> str:
    return f"autopublish: {s.get('label')} (session {s.get('session_key')}) will not settle"


def body_for(s: dict, run_url: str) -> str:
    return "\n".join([
        "`scripts/autopublish.py` has refused to publish this session for more than six hours",
        "past its end, so this is a data problem rather than something to wait for.",
        "",
        f"- **session_key**: {s.get('session_key')}",
        f"- **missing conditions**: {', '.join(s.get('missing') or []) or '—'}",
        f"- **reason**: {s.get('why')}",
        f"- **laps seen**: {s.get('lap_count')} (previous run: {s.get('previous_lap_count')})",
        f"- **CHEQUERED FLAG in race_control**: {s.get('chequered')}",
        "",
        "Nothing was committed and nothing was published.",
        "",
        f"Run log: {run_url}" if run_url else "",
        "",
        "To look at it by hand:",
        "",
        f"    python scripts/postrace_check.py {s.get('session_key')}",
        "",
        "If there is genuinely nothing to publish — a cancelled session, a key OpenF1",
        "abandoned — then add it to `backend/excluded_sessions.json` with the reason. That",
        "is what stops this permanently. Closing this issue does not: the next run reopens",
        "it, on purpose, because an unexplained stuck session should keep asking.",
        "",
        "(Sessions OpenF1 marks `is_cancelled` are already dropped automatically and never",
        "reach this issue. Sakhir and Jeddah 2026 are both flagged and both listed in the",
        "file as well.)",
    ])


# A failure to list is not "there is no issue". Creating one on a listing error
# is exactly how duplicates appear, so the three outcomes are kept apart.
FOUND, NONE, UNKNOWN = "found", "none", "unknown"


def find_issue(title: str, listing: list[dict] | None = None) -> tuple[str, str | None, str | None]:
    """
    (outcome, number, state) for the issue with exactly this title.

    `listing` is injectable so the matching is testable without a network or a
    `gh` binary; in the Action it is fetched here.
    """
    if listing is None:
        code, out = gh("issue", "list", "--state", "all", "--limit", "200",
                       "--json", "number,title,state")
        if code != 0:
            print(f"could not list issues: {out}")
            return UNKNOWN, None, None
        try:
            listing = json.loads(out)
        except json.JSONDecodeError:
            print("could not parse the issue list")
            return UNKNOWN, None, None
    for row in listing or []:
        if row.get("title") == title:
            return FOUND, str(row.get("number")), (row.get("state") or "").upper()
    return NONE, None, None


def upsert(s: dict, run_url: str) -> None:
    title = title_for(s)
    outcome, number, state = find_issue(title)

    if outcome == UNKNOWN:
        # Say nothing rather than risk a second issue for the same session. The
        # next run will list successfully and comment on the one that exists.
        print(f"issue list unavailable — not filing for session {s.get('session_key')} this run")
        return

    if outcome == FOUND:
        if state == "CLOSED":
            gh("issue", "reopen", number)
        note = "Still unresolved."
        if state == "CLOSED":
            note += (" Reopened — closing does not silence this; add the session to"
                     " `backend/excluded_sessions.json` if there is nothing to publish.")
        code, out = gh("issue", "comment", number, "--body", f"{note} {run_url}".strip())
        print(f"issue #{number} updated" if code == 0 else f"issue #{number} comment failed: {out}")
        return

    code, out = gh("issue", "create", "--title", title, "--body", body_for(s, run_url))
    print(f"issue created: {out}" if code == 0 else f"could not create the issue: {out}")


def main() -> int:
    try:
        report = json.loads(os.environ.get("REPORT", "") or "{}")
    except json.JSONDecodeError:
        print("REPORT is not valid JSON")
        return 0
    stuck = report.get("stuck") or []
    if not stuck:
        print("no stuck session")
        return 0
    run_url = os.environ.get("RUN_URL", "")
    for s in stuck:
        upsert(s, run_url)
    return 0


if __name__ == "__main__":
    sys.exit(main())
