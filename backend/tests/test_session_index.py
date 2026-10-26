"""
GET /published and GET /sessions/{key}/calendar.ics (block 33). No OpenF1:
fetch_json is replaced by one that fails the test if anything calls it.
"""
from __future__ import annotations

import json
import os
import shutil
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api import session_index, session_meta
from app.core.config import settings
from app.main import app

REPO_CACHE = Path(__file__).resolve().parent.parent / "cache"
client = TestClient(app)


@pytest.fixture(autouse=True)
def no_openf1(monkeypatch):
    async def refuse(*args, **kwargs):
        raise AssertionError(f"OpenF1 called: {args} {kwargs}")
    monkeypatch.setattr(session_meta, "fetch_json", refuse)
    session_index._reset_for_tests()
    if hasattr(session_meta, "_reset_for_tests"):
        session_meta._reset_for_tests()


def _session(root: Path, key: int, meta: dict | None, published: bool) -> Path:
    d = root / str(key)
    d.mkdir(parents=True, exist_ok=True)
    if meta is not None:
        (d / "_session_meta.json").write_text(json.dumps({"session_key": key, **meta}))
    if published:
        (d / "_analysis.json").write_text("{}")
    return d


@pytest.fixture
def cache(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "cache_dir", str(tmp_path))
    return tmp_path


# ── /published ──────────────────────────────────────────────────────────────

def test_published_lists_only_sessions_with_an_analysis(cache):
    _session(cache, 11377, {"meeting_key": 1290, "year": 2026, "session_name": "Race", "session_type": "Race"}, True)
    _session(cache, 11372, {"meeting_key": 1290, "year": 2026, "session_name": "Sprint", "session_type": "Race"}, False)
    _session(cache, 9197, None, True)                        # published, no meta: key only
    (cache / "meetings_2026.json").write_text("[]")          # files at the root are ignored
    body = client.get("/published").json()
    assert body["count"] == 2
    assert body["sessions"] == [
        {"session_key": 9197, "meeting_key": None, "year": None, "session_name": None, "session_type": None},
        {"session_key": 11377, "meeting_key": 1290, "year": 2026, "session_name": "Race", "session_type": "Race"},
    ]


def test_published_is_rebuilt_when_an_analysis_lands_and_not_otherwise(cache, monkeypatch):
    d = _session(cache, 11372, {"year": 2026}, False)
    assert client.get("/published").json()["count"] == 0
    builds = []
    real = session_index._Index._build
    monkeypatch.setattr(session_index._Index, "_build", staticmethod(lambda root: builds.append(1) or real(root)))
    client.get("/published")
    assert builds == []                                      # nothing changed on disk
    (d / "_analysis.json").write_text("{}")
    os.utime(d, ns=(time.time_ns() + 10**9,) * 2)            # mtime granularity on some filesystems
    assert client.get("/published").json()["count"] == 1
    assert builds == [1]


def test_published_reads_the_repo_cache_without_writing_it():
    before = {p: p.stat().st_mtime_ns for p in REPO_CACHE.rglob("*") if p.is_file()}
    body = client.get("/published").json()
    keys = {s["session_key"] for s in body["sessions"]}
    assert {11377, 9197, 9636}.issubset(keys)                # Baku 2026, Abu Dhabi 2023, São Paulo 2024
    baku = next(s for s in body["sessions"] if s["session_key"] == 11377)
    assert baku["year"] == 2026 and baku["session_name"] == "Race"
    after = {p: p.stat().st_mtime_ns for p in REPO_CACHE.rglob("*") if p.is_file()}
    assert before == after


def test_published_on_a_missing_cache_dir_is_empty(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "cache_dir", str(tmp_path / "nope"))
    assert client.get("/published").json() == {"count": 0, "sessions": []}


# ── calendar.ics ────────────────────────────────────────────────────────────

BAKU = {"meeting_key": 1290, "meeting_name": "Azerbaijan Grand Prix", "location": "Baku",
        "circuit_short_name": "Baku", "country_name": "Azerbaijan", "year": 2026,
        "session_name": "Race", "session_type": "Race",
        "date_start": "2026-09-20T15:00:00+04:00", "date_end": "2026-09-20T17:00:00+04:00"}


def _unfold(text: str) -> list[str]:
    return text.replace("\r\n ", "").split("\r\n")


def test_ics_is_rfc5545_in_utc_with_a_stable_uid(cache):
    _session(cache, 11377, BAKU, True)
    r = client.get("/sessions/11377/calendar.ics")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/calendar")
    assert r.headers["content-disposition"] == 'inline; filename="pitwall-11377.ics"'
    assert "\r\n" in r.text and "\n" not in r.text.replace("\r\n", "")
    lines = _unfold(r.text)
    assert lines[0] == "BEGIN:VCALENDAR" and lines[-2] == "END:VCALENDAR" and lines[-1] == ""
    assert "UID:pitwall-11377@pitwallengineer.com" in lines
    assert "DTSTART:20260920T110000Z" in lines and "DTEND:20260920T130000Z" in lines
    assert "SUMMARY:Azerbaijan Grand Prix: Race" in lines
    assert "LOCATION:Baku\\, Azerbaijan" in lines
    assert all(len(l.encode()) <= 75 for l in r.text.split("\r\n"))
    # Same session, same file: a calendar updates in place.
    assert client.get("/sessions/11377/calendar.ics").text == r.text


def test_ics_escapes_and_folds_long_text():
    meta = {**BAKU, "session_key": 1, "meeting_name": "Grand Prix; with, commas \\ and a very long name " * 2}
    text = session_index.build_ics(meta)
    summary = next(l for l in _unfold(text) if l.startswith("SUMMARY:"))
    assert "\\;" in summary and "\\," in summary and "\\\\" in summary
    assert all(len(l.encode()) <= 75 for l in text.split("\r\n"))


def test_ics_without_an_end_uses_the_session_length():
    meta = {**BAKU, "session_key": 2, "date_end": None, "session_type": "Practice", "session_name": "Practice 1"}
    lines = _unfold(session_index.build_ics(meta))
    assert "DTSTART:20260920T110000Z" in lines and "DTEND:20260920T120000Z" in lines


def test_ics_for_a_cancelled_session_is_410(cache):
    _session(cache, 11261, {**BAKU, "is_cancelled": True}, False)
    r = client.get("/sessions/11261/calendar.ics")
    assert r.status_code == 410 and r.json()["error"]["code"] == "SESSION_CANCELLED"


def test_ics_for_a_2023_race_from_the_repo_cache():
    r = client.get("/sessions/9197/calendar.ics")
    assert r.status_code == 200
    lines = _unfold(r.text)
    assert "UID:pitwall-9197@pitwallengineer.com" in lines
    assert any(l.startswith("DTSTART:2023") for l in lines)
