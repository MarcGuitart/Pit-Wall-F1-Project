"""
GET /stats — Block 29. Counts from the published analyses, defined in
app/api/stats.py; cached until ANALYSIS_VERSION or an analysis file changes.
"""
from __future__ import annotations

import json
import os

import pytest
from fastapi.testclient import TestClient

from app.api import stats as stats_api
from app.core.config import settings
from app.core.version import ANALYSIS_VERSION
from app.domain.models import FullRaceAnalysis
from app.main import app


def analysis(year, rows, version=ANALYSIS_VERSION):
    return {"analysis_version": version, "race": {"year": year, "meeting_name": "X", "session_key": 1},
            "true_pace": rows}


ROW = {"sample_size": 52, "exclusion_log": ["14 laps excluded: SC/VSC", "2 laps excluded: pit in/out", "1 lap excluded: outlier (>2.5 IQR)"],
       "driver_code": "VER", "median_clean_lap": 83.6}


@pytest.fixture
def cache(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "cache_dir", str(tmp_path))
    stats_api._reset_for_tests()

    def put(key, doc):
        d = tmp_path / str(key)
        d.mkdir(exist_ok=True)
        p = d / "_analysis.json"
        p.write_text(doc if isinstance(doc, str) else json.dumps(doc))
        return p
    yield put
    stats_api._reset_for_tests()


@pytest.fixture
def client():
    return TestClient(app)


def test_counts_only_current_analyses(cache, client):
    cache(9636, analysis(2024, [ROW, {**ROW, "sample_size": 10, "exclusion_log": []}]))
    cache(11377, analysis(2026, [ROW]))
    cache(9000, analysis(2023, [ROW], version="1"))     # stale: not what /analysis serves
    cache(9001, "{not json")                             # unreadable
    body = client.get("/stats").json()
    assert body["sessions"] == 2
    assert body["driver_laps"] == (52 + 17) + 10 + (52 + 17)
    assert body["seasons"] == [2024, 2026]


def test_modules_come_from_the_analysis_model_not_a_constant(cache, client):
    body = client.get("/stats").json()
    expected = sorted(set(FullRaceAnalysis.model_fields) - {"race", "analysis_version", "modules"})
    assert body["module_names"] == expected and body["modules"] == len(expected)
    assert "true_pace" in expected and "chaos" in expected


def test_every_figure_carries_its_definition(cache, client):
    body = client.get("/stats").json()
    assert set(body["definitions"]) == {"sessions", "driver_laps", "seasons", "modules"}


def test_public_and_without_race_content(cache, client):
    cache(9636, analysis(2024, [ROW]))
    r = client.get("/stats")                              # no token
    assert r.status_code == 200
    assert set(r.json()) == {"sessions", "driver_laps", "seasons", "modules", "module_names", "analysis_version", "definitions"}
    assert "VER" not in r.text


def test_cached_until_a_file_changes(cache, client, monkeypatch):
    p = cache(9636, analysis(2024, [ROW]))
    calls = {"n": 0}
    real = stats_api.compute
    monkeypatch.setattr(stats_api, "compute", lambda files: (calls.__setitem__("n", calls["n"] + 1), real(files))[1])
    client.get("/stats"); client.get("/stats")
    assert calls["n"] == 1
    p.write_text(json.dumps(analysis(2024, [ROW, ROW])))
    os.utime(p, ns=(p.stat().st_atime_ns, p.stat().st_mtime_ns + 1_000_000))
    assert client.get("/stats").json()["driver_laps"] == 2 * 69
    assert calls["n"] == 2
    cache(11377, analysis(2026, [ROW]))                   # computed on demand after boot
    assert client.get("/stats").json()["sessions"] == 1
    assert calls["n"] == 2                                # not a publication: nothing to recompute


def test_a_new_pipeline_version_invalidates(cache, client, monkeypatch):
    cache(9636, analysis(2024, [ROW]))
    assert client.get("/stats").json()["sessions"] == 1
    monkeypatch.setattr(stats_api, "ANALYSIS_VERSION", "999")
    assert client.get("/stats").json()["sessions"] == 0  # nothing current any more


def test_the_real_cache(client):
    """Read-only over backend/cache (the suite's guard fails any write)."""
    stats_api._reset_for_tests()
    body = client.get("/stats").json()
    assert body["sessions"] > 0 and body["driver_laps"] > body["sessions"]
    assert 2024 in body["seasons"]


def test_an_analysis_computed_after_boot_changes_no_figure(cache, client, monkeypatch):
    """The figures are the published analyses (present at boot: the repo's, on Render). An analysis
    written later by /analysis, through the real cache writer, changes none of them."""
    from app.core import cache as cache_store
    cache(9636, analysis(2024, [ROW]))
    before = client.get("/stats").json()
    cache_store.set_full_analysis(11377, analysis(2026, [ROW, ROW]))
    after = client.get("/stats").json()
    assert after == before
    assert after["sessions"] == 1 and after["seasons"] == [2024] and after["driver_laps"] == 69


def test_the_snapshot_is_taken_at_startup_not_at_the_first_request(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "cache_dir", str(tmp_path))
    stats_api._reset_for_tests()
    (tmp_path / "9636").mkdir()
    (tmp_path / "9636" / "_analysis.json").write_text(json.dumps(analysis(2024, [ROW])))
    with TestClient(app) as c:                            # runs the startup hook
        (tmp_path / "11377").mkdir()                       # before any request, after boot
        (tmp_path / "11377" / "_analysis.json").write_text(json.dumps(analysis(2026, [ROW])))
        assert c.get("/stats").json()["sessions"] == 1
        assert c.get("/published").json()["count"] == 1
    stats_api._reset_for_tests()


def test_sessions_is_defined_as_the_analyses_versioned_in_the_repo(cache, client):
    assert "versioned in the repo" in client.get("/stats").json()["definitions"]["sessions"]
