"""
One issue per stuck session, ever.

The bug this guards against is not "the code intends to deduplicate" — it did.
It is that the intent rested on GitHub's search index: `gh issue list --search
'"title" in:title'` is eventually consistent, and the titles contain a "·" the
query parser may do anything with. An issue filed ten minutes earlier could be
invisible, and the hourly cron racing a manual dispatch would file two.

Matching now happens in-process on the exact title, so these tests are about the
matching and the three outcomes, with no network and no `gh` binary.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def load(name: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


issue = load("autopublish_issue")

STUCK = {
    "session_key": 11261,
    "label": "Sakhir 2026 · Race",
    "why": "no laps in the feed",
    "missing": ["chequered", "stable_laps"],
    "lap_count": 0,
    "previous_lap_count": 0,
    "chequered": False,
}
TITLE = issue.title_for(STUCK)


def test_the_title_identifies_the_session():
    assert "11261" in TITLE
    assert "Sakhir 2026 · Race" in TITLE


def test_an_open_issue_with_the_same_title_is_found():
    listing = [{"number": 7, "title": TITLE, "state": "OPEN"}]
    assert issue.find_issue(TITLE, listing) == (issue.FOUND, "7", "OPEN")


def test_a_closed_issue_with_the_same_title_is_found_not_duplicated():
    listing = [{"number": 7, "title": TITLE, "state": "CLOSED"}]
    outcome, number, state = issue.find_issue(TITLE, listing)
    assert outcome == issue.FOUND
    assert number == "7"
    assert state == "CLOSED"


def test_another_session_is_not_a_match():
    other = issue.title_for({**STUCK, "session_key": 11269, "label": "Jeddah 2026 · Race"})
    listing = [{"number": 7, "title": other, "state": "OPEN"}]
    assert issue.find_issue(TITLE, listing) == (issue.NONE, None, None)


def test_a_title_that_merely_contains_the_session_is_not_a_match():
    """A human-written issue mentioning the session must not absorb the report."""
    listing = [
        {"number": 3, "title": f"Re: {TITLE} — see also", "state": "OPEN"},
        {"number": 4, "title": "autopublish: session 11261", "state": "OPEN"},
    ]
    assert issue.find_issue(TITLE, listing) == (issue.NONE, None, None)


def test_an_empty_repository_reports_none():
    assert issue.find_issue(TITLE, []) == (issue.NONE, None, None)


def test_a_failed_listing_is_unknown_and_never_creates(monkeypatch):
    """
    The important one. A listing failure must not read as "no issue exists" —
    that is precisely how a duplicate gets filed.
    """
    monkeypatch.setattr(issue, "gh", lambda *a: (1, "gh: API rate limit exceeded"))
    assert issue.find_issue(TITLE) == (issue.UNKNOWN, None, None)

    calls = []
    monkeypatch.setattr(issue, "gh", lambda *a: (calls.append(a), (1, "boom"))[1])
    issue.upsert(STUCK, "https://example.invalid/run/1")
    assert not any(c[:2] == ("issue", "create") for c in calls)


def test_unparsable_listing_output_is_unknown(monkeypatch):
    monkeypatch.setattr(issue, "gh", lambda *a: (0, "not json at all"))
    assert issue.find_issue(TITLE) == (issue.UNKNOWN, None, None)


def test_an_open_issue_is_commented_on_and_not_reopened(monkeypatch):
    calls = []

    def fake_gh(*args):
        calls.append(args)
        if args[:2] == ("issue", "list"):
            return 0, '[{"number": 7, "title": %r, "state": "OPEN"}]'.replace("%r", f'"{TITLE}"')
        return 0, "ok"

    monkeypatch.setattr(issue, "gh", fake_gh)
    issue.upsert(STUCK, "https://example.invalid/run/1")
    verbs = [c[:2] for c in calls]
    assert ("issue", "create") not in verbs
    assert ("issue", "reopen") not in verbs
    assert ("issue", "comment") in verbs


def test_a_closed_issue_is_reopened_and_told_how_to_silence_it(monkeypatch):
    calls = []

    def fake_gh(*args):
        calls.append(args)
        if args[:2] == ("issue", "list"):
            return 0, f'[{{"number": 7, "title": "{TITLE}", "state": "CLOSED"}}]'
        return 0, "ok"

    monkeypatch.setattr(issue, "gh", fake_gh)
    issue.upsert(STUCK, "")
    verbs = [c[:2] for c in calls]
    assert ("issue", "create") not in verbs
    assert ("issue", "reopen") in verbs
    comment = next(c for c in calls if c[:2] == ("issue", "comment"))
    assert "excluded_sessions.json" in comment[-1]


def test_a_session_with_no_issue_yet_gets_one(monkeypatch):
    calls = []

    def fake_gh(*args):
        calls.append(args)
        return (0, "[]") if args[:2] == ("issue", "list") else (0, "https://example.invalid/issues/9")

    monkeypatch.setattr(issue, "gh", fake_gh)
    issue.upsert(STUCK, "")
    assert ("issue", "create") in [c[:2] for c in calls]


def test_the_body_points_at_the_exclusions_file():
    body = issue.body_for(STUCK, "https://example.invalid/run/1")
    assert "excluded_sessions.json" in body
    assert "Closing this issue does not" in body


def test_no_stuck_session_files_nothing(monkeypatch):
    monkeypatch.setenv("REPORT", '{"published": [], "stuck": []}')
    monkeypatch.setattr(issue, "gh", lambda *a: pytest.fail("gh must not be called"))
    assert issue.main() == 0
