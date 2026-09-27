"""
The commit message for a publication run, on stdout.

    python scripts/publish_commit_message.py report.json

Two races an hour and a nineteen-race backfill are the same commit, and the
subject line cannot be the same shape for both: "feat(cache): publish Melbourne
2026 · Race, Shanghai 2026 · Sprint, Shanghai 2026 · Race, Suzuka 2026 · Race,
…" for a season is a subject nobody can read in a log. Past a handful the
subject becomes a count and the sessions move into the body, where they are one
per line and all still there.

[skip ci] and not [skip render]: it stops GitHub Actions re-triggering on our own
commit, and Render does not recognise it at all — it only honours [skip render]
and its synonyms — so the deploy we want still happens.

A script rather than a heredoc in the workflow, for the reason the workflow
gives itself: every non-trivial step is something that can be run from a laptop.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# Above this many, the subject is a count and the list goes in the body.
NAME_SUBJECT_MAX = 3


def message(published: list[dict]) -> str:
    names = [p.get("label") or f"session {p.get('session_key')}" for p in published]

    if not names:
        return "feat(cache): publish a finished session [skip ci]"

    if len(names) <= NAME_SUBJECT_MAX:
        return f"feat(cache): publish {', '.join(names)} [skip ci]"

    body = "\n".join(f"- {name}" for name in names)
    return (
        f"feat(cache): backfill {len(names)} sessions [skip ci]\n"
        "\n"
        "One commit and one deploy for the whole set, rather than one of each per\n"
        "pair of races. Every session went through the same readiness check as an\n"
        "hourly run — past the unlock buffer, chequered flag seen, laps on record —\n"
        "and only the per-run cap was lifted.\n"
        "\n"
        f"{body}\n"
    )


def main() -> int:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "report.json")
    try:
        report = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        # Never fail the commit over the message. A run that computed nineteen
        # analyses must not lose them because a report file was unreadable.
        print(f"feat(cache): publish a finished session [skip ci]")
        print(f"\n(commit message fell back to the default: {type(exc).__name__})", file=sys.stderr)
        return 0
    print(message(report.get("published") or []))
    return 0


if __name__ == "__main__":
    sys.exit(main())
