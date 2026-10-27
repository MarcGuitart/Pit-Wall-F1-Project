"""
/races/{meeting_key}/sessions with the meeting's list missing from the cache
directory (24 Oct: Render answered 1 row for Barcelona 2024, meeting 1238).

The only path that gives exactly that row (9539, Race) is OpenF1 401 plus the
analysis-cache fallback, which knows only the sessions with an analysis. It
used to save that partial list as the meeting's list, so every later request
got 1 row without asking again. Now the versioned copy in backend/cache is
read first, and the partial list is served but never saved. No OpenF1: the
client is replaced in every test.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api import races
from app.clients.openf1_client import OpenF1AuthError
from app.core.config import settings
from app.main import app

REPO_CACHE = Path(__file__).resolve().parent.parent / "cache"
client = TestClient(app)
FIVE = [9532, 9533, 9534, 9535, 9539]


@pytest.fixture
def no_openf1(monkeypatch):
    calls = []

    async def auth_401(*args, **kwargs):
        calls.append((args, kwargs))
        raise OpenF1AuthError("401")
    monkeypatch.setattr(races, "fetch_json", auth_401)
    return calls


@pytest.fixture
def barcelona_race_only(monkeypatch, tmp_path):
    """A cache directory with the Barcelona race's analysis and no meeting_1238_sessions.json."""
    shutil.copytree(REPO_CACHE / "9539", tmp_path / "9539", ignore=shutil.ignore_patterns("*.json.gz"))
    monkeypatch.setattr(settings, "cache_dir", str(tmp_path))
    return tmp_path


def keys(r):
    return [s["session_key"] for s in r.json()]


def test_the_repo_file_has_the_whole_meeting_with_is_cancelled_on_every_row():
    rows = json.loads((REPO_CACHE / "meeting_1238_sessions.json").read_text())
    assert [r["session_key"] for r in rows] == FIVE
    assert all(r.get("is_cancelled") is False for r in rows)
    assert races._has_meta(rows)


def test_the_repo_cache_serves_five_rows_without_openf1(no_openf1):
    r = client.get("/races/1238/sessions")
    assert r.status_code == 200 and keys(r) == FIVE
    assert no_openf1 == []


def test_a_cache_dir_without_the_list_reads_the_versioned_copy(barcelona_race_only, no_openf1):
    r = client.get("/races/1238/sessions")
    assert keys(r) == FIVE
    assert no_openf1 == []                                        # never reached OpenF1
    assert not (barcelona_race_only / "meeting_1238_sessions.json").exists()   # read only


def test_the_partial_list_is_served_but_never_saved(barcelona_race_only, no_openf1, monkeypatch, tmp_path_factory):
    monkeypatch.setattr(races, "_REPO_CACHE", tmp_path_factory.mktemp("no-repo-copy"))
    first = client.get("/races/1238/sessions")
    assert keys(first) == [9539]                                  # what Render answered
    assert not (barcelona_race_only / "meeting_1238_sessions.json").exists()
    client.get("/races/1238/sessions")
    assert len(no_openf1) == 2                                    # asked again, not stuck on the partial list


def test_a_list_without_is_cancelled_is_served_whole_when_openf1_refuses(barcelona_race_only, no_openf1, monkeypatch, tmp_path_factory):
    """A row without is_cancelled fails _has_meta: OpenF1 is asked once, and on a 401 the cached rows are
    served as they are, the race included; nothing is filtered."""
    monkeypatch.setattr(races, "_REPO_CACHE", tmp_path_factory.mktemp("no-repo-copy"))
    rows = json.loads((REPO_CACHE / "meeting_1238_sessions.json").read_text())
    for r in rows:
        r.pop("is_cancelled")
    (barcelona_race_only / "meeting_1238_sessions.json").write_text(json.dumps(rows))
    r = client.get("/races/1238/sessions")
    assert keys(r) == FIVE and len(no_openf1) == 1


# ── hardening: the versioned copy is the floor ──────────────────────────────

def _one_row(cache: Path, keep_meta: bool = True) -> Path:
    rows = json.loads((REPO_CACHE / "meeting_1238_sessions.json").read_text())
    race = [r for r in rows if r["session_key"] == 9539]
    if not keep_meta:
        race[0].pop("is_cancelled")
    p = cache / "meeting_1238_sessions.json"
    p.write_text(json.dumps(race))
    return p


def test_a_partial_file_in_the_cache_dir_is_completed_from_the_versioned_copy(barcelona_race_only, no_openf1):
    p = _one_row(barcelona_race_only)
    before = p.read_text()
    r = client.get("/races/1238/sessions")
    assert keys(r) == FIVE                                        # the copy's 5, not the file's 1
    assert no_openf1 == []
    assert p.read_text() == before                                # served, not rewritten


def test_openf1_401_with_a_partial_file_does_not_rewrite_it(barcelona_race_only, no_openf1):
    p = _one_row(barcelona_race_only, keep_meta=False)            # old format: OpenF1 is asked
    before = p.read_text()
    r = client.get("/races/1238/sessions")
    assert len(no_openf1) == 1
    assert keys(r) == FIVE
    assert p.read_text() == before


def test_a_shorter_openf1_answer_is_never_saved_over_a_longer_list(barcelona_race_only, monkeypatch, tmp_path_factory):
    monkeypatch.setattr(races, "_REPO_CACHE", tmp_path_factory.mktemp("no-repo-copy"))
    rows = json.loads((REPO_CACHE / "meeting_1238_sessions.json").read_text())
    for r in rows:
        r.pop("is_cancelled")                                     # forces the OpenF1 refresh
    p = barcelona_race_only / "meeting_1238_sessions.json"
    p.write_text(json.dumps(rows))
    before = p.read_text()

    async def two_rows(*args, **kwargs):
        return [{"session_key": 9535, "session_name": "Qualifying", "session_type": "Qualifying",
                 "date_start": "2024-06-22T14:00:00+00:00", "is_cancelled": False},
                {"session_key": 9539, "session_name": "Race", "session_type": "Race",
                 "date_start": "2024-06-23T13:00:00+00:00", "is_cancelled": False}]
    monkeypatch.setattr(races, "fetch_json", two_rows)
    r = client.get("/races/1238/sessions")
    assert sorted(keys(r)) == FIVE
    assert p.read_text() == before


def test_a_complete_openf1_answer_is_saved(barcelona_race_only, monkeypatch, tmp_path_factory):
    monkeypatch.setattr(races, "_REPO_CACHE", tmp_path_factory.mktemp("no-repo-copy"))
    rows = json.loads((REPO_CACHE / "meeting_1238_sessions.json").read_text())

    async def five(*args, **kwargs):
        return rows
    monkeypatch.setattr(races, "fetch_json", five)
    assert keys(client.get("/races/1238/sessions")) == FIVE
    saved = json.loads((barcelona_race_only / "meeting_1238_sessions.json").read_text())
    assert [r["session_key"] for r in saved] == FIVE


def test_union_keeps_one_row_per_session_in_date_order():
    a = [{"session_key": 2, "date_start": "2024-01-02"}, {"session_key": 1, "date_start": "2024-01-01"}]
    b = [{"session_key": 2, "date_start": "2024-01-02", "x": 1}, {"session_key": 3, "date_start": "2024-01-03"}]
    out = races._union(a, b)
    assert [r["session_key"] for r in out] == [1, 2, 3] and out[1]["x"] == 1
