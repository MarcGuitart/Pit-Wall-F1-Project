"""
Stale analyses and the publish Action — Block 30a, task 2 (a prerequisite of
block 28, which raises ANALYSIS_VERSION).

Before: the hourly cron regenerated sessions published at an older
ANALYSIS_VERSION two at a time, so N stale sessions were N/2 commits and N/2
Render deploys. Now the cron leaves them and says so once per version on
Telegram; only a dispatch with their session_keys regenerates them, all in one
run (one commit). New sessions publish exactly as before.
"""
from __future__ import annotations

import asyncio
import importlib.util
import json
from datetime import timedelta
from pathlib import Path

import pytest

from app.core.version import ANALYSIS_VERSION
from tests.test_autopublish import BAKU_END, FINISHED_RC, laps, session

BACKEND = Path(__file__).resolve().parents[1]


def _load(name: str, file: str):
    spec = importlib.util.spec_from_file_location(name, BACKEND / "scripts" / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


NOW = BAKU_END + timedelta(hours=7)          # long settled: ready on one observation
STALE = (11234, 11240)                       # published at an older pipeline
NEW = 11377                                  # never published


@pytest.fixture
def world(monkeypatch, tmp_path):
    script = _load("autopublish_script_stale", "autopublish.py")
    monkeypatch.setattr(script.settings, "cache_dir", str(tmp_path / "cache"))
    for key in STALE:
        d = tmp_path / "cache" / str(key)
        d.mkdir(parents=True)
        (d / "_analysis.json").write_text(json.dumps({"analysis_version": "1", "race": {"session_key": key}}))

    metas = {k: session(k, circuit=f"C{k}") for k in (*STALE, NEW)}
    season = {"value": [metas[k] for k in (*STALE, NEW)]}

    async def fake_fetch(endpoint, **params):
        if endpoint == "sessions":
            if "session_key" in params:
                return [metas[params["session_key"]]]
            return season["value"]
        if endpoint == "race_control":
            return FINISHED_RC
        if endpoint == "laps":
            return laps(50)
        raise AssertionError(endpoint)

    computed: list[int] = []

    async def fake_compute(key: int) -> dict:
        computed.append(key)
        d = script.settings.cache_path / str(key)
        d.mkdir(parents=True, exist_ok=True)
        doc = {"analysis_version": ANALYSIS_VERSION, "race": {"session_key": key, "session_name": "Race", "year": 2026},
               "chaos": {}, "race_classification": [], "modules": {}}
        (d / "_analysis.json").write_text(json.dumps(doc))
        return doc

    import datetime as _dt

    class Fixed(_dt.datetime):
        @classmethod
        def now(cls, tz=None):
            return NOW

    monkeypatch.setattr(script, "fetch_json", fake_fetch)
    monkeypatch.setattr(script, "compute", fake_compute)
    monkeypatch.setattr(script, "datetime", Fixed)

    def run(keys=None, limit=None):
        return asyncio.run(script.run(
            session_keys=keys, state_path=tmp_path / "state.json", dry_run=False, year=2026,
            exclusions_path=tmp_path / "none.json", limit=script.resolve_limit(limit, keys),
        ))

    return script, run, computed, season, metas


def test_cron_with_only_stale_sessions_publishes_nothing_and_alerts_once(world):
    script, run, computed, season, metas = world
    season["value"] = [metas[k] for k in STALE]
    first = run()
    assert first["published"] == [] and computed == []          # → the workflow commits nothing
    assert first["stale"] == {"version": ANALYSIS_VERSION, "count": 2, "session_keys": list(STALE), "alert": True}
    second = run()                                               # the next hourly run
    assert second["published"] == [] and computed == []
    assert second["stale"]["alert"] is False                     # once per version, not every hour


def test_a_new_version_alerts_again(world, monkeypatch):
    script, run, computed, season, metas = world
    season["value"] = [metas[k] for k in STALE]
    run()
    monkeypatch.setattr(script, "ANALYSIS_VERSION", "999")       # the pipeline moves on again
    assert run()["stale"]["alert"] is True


def test_new_sessions_still_publish_as_today_next_to_stale_ones(world):
    script, run, computed, season, metas = world
    report = run()
    assert [p["session_key"] for p in report["published"]] == [NEW]
    assert computed == [NEW]
    assert report["limit"] == script.MAX_PER_RUN                # the cron keeps its cap


def test_a_dispatch_with_session_keys_regenerates_them_in_one_run(world):
    script, run, computed, season, metas = world
    report = run(keys=[*STALE, NEW])
    assert sorted(p["session_key"] for p in report["published"]) == sorted([*STALE, NEW])
    assert report["deferred"] == []                             # all of them: one commit
    assert report["limit"] == 0


def test_the_cap_is_off_only_for_an_explicit_list():
    script = _load("autopublish_script_limit", "autopublish.py")
    assert script.resolve_limit(None, [1, 2, 3]) == 0
    assert script.resolve_limit(None, None) == script.MAX_PER_RUN
    assert script.resolve_limit(5, [1]) == 5


def test_stale_sessions_reads_the_whole_archive(tmp_path):
    script = _load("autopublish_script_scan", "autopublish.py")
    for key, version in ((9197, "1"), (9539, ANALYSIS_VERSION), (11234, "3")):
        d = tmp_path / str(key)
        d.mkdir()
        (d / "_analysis.json").write_text(json.dumps({"analysis_version": version}))
    (tmp_path / "meetings_2024.json").write_text("[]")
    assert script.stale_sessions(tmp_path, ANALYSIS_VERSION) == [9197, 11234]


def test_telegram_says_how_many_and_what_to_do_once():
    nt = _load("notify_telegram_stale", "notify_telegram.py")
    alert = {"published": [], "stuck": [], "errors": [],
             "stale": {"version": "5", "count": 2, "session_keys": [11234, 11240], "alert": True}}
    m = nt.build_message(alert, {})
    assert "2 sesiones obsoletas, lanza el backfill" in m and "11234,11240" in m
    quiet = {**alert, "stale": {**alert["stale"], "alert": False}}
    assert nt.build_message(quiet, {}) is None                   # the hours after: silence
