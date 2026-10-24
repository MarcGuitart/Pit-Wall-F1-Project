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
