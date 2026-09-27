"""
Open or update a GitHub issue for a session that will not settle.

    REPORT='{"stuck":[...]}' python scripts/autopublish_issue.py

Uses the `gh` CLI, which is on every GitHub runner and authenticated by
GH_TOKEN. One issue per session, found by exact title and reopened rather than
duplicated, so six hours of hourly runs leave one issue with a comment per run
and not six issues.

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
        "If OpenF1 simply has no data for this session — it happens; Sakhir and Jeddah 2026",
        "both have zero laps — then there is nothing to publish and this issue can be closed.",
    ])


def existing_issue(title: str) -> str | None:
    code, out = gh("issue", "list", "--state", "all", "--limit", "100",
                   "--search", f'"{title}" in:title', "--json", "number,title")
    if code != 0:
        print(f"could not search issues: {out}")
        return None
    try:
        rows = json.loads(out)
    except json.JSONDecodeError:
        return None
    for row in rows:
        if row.get("title") == title:
            return str(row.get("number"))
    return None


def upsert(s: dict, run_url: str) -> None:
    title = title_for(s)
    number = existing_issue(title)
    if number:
        gh("issue", "reopen", number)
        code, out = gh("issue", "comment", number,
                       "--body", f"Still unresolved. {run_url}".strip())
        print(f"issue #{number} updated" if code == 0 else f"issue #{number} comment failed: {out}")
        return
    code, out = gh("issue", "create", "--title", title, "--body", body_for(s, run_url))
    if code != 0:
        print(f"could not create the issue: {out}")
        return
    print(f"issue created: {out}")


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
