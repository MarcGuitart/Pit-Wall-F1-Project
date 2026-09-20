"""
/analysis and a cached _analysis.json that is not what the current code expects.

- v1 file (no chaos.method_version, components without 'stewarding'): valid
  JSON from an older method → recomputed from the cached raw data, 200,
  file rewritten as v2.
- truncated file: not JSON → ANALYSIS_FAILED, file discarded so the next
  request recomputes.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services.chaos_service import METHOD_VERSION

REAL_CACHE = Path(__file__).resolve().parent.parent / "cache"
RAW = ("laps", "stints", "pit", "position", "intervals", "race_control", "weather", "drivers")


@pytest.fixture
def isolated_9539(monkeypatch, tmp_path):
    """Copy 9539's raw endpoints + meta into a temp cache dir (no _analysis.json)."""
    src = REAL_CACHE / "9539"
    if not src.exists():
        pytest.skip("cache/9539 not present")
    dst = tmp_path / "9539"
    dst.mkdir()
    for name in RAW:
        shutil.copy(src / f"{name}.json", dst / f"{name}.json")
    shutil.copy(src / "_session_meta.json", dst / "_session_meta.json")
    monkeypatch.setattr(settings, "cache_dir", str(tmp_path))
    return dst


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


def _v1_analysis(dst: Path) -> dict:
    """Take the real v2 analysis and degrade it to the v1 chaos schema."""
    data = json.loads((REAL_CACHE / "9539" / "_analysis.json").read_text())
    chaos = data["chaos"]
    chaos.pop("method_version", None)
    chaos.pop("breakdown", None)
    comp = chaos["components"]
    comp.pop("stewarding", None)
    comp["investigations"] = 20
    comp["penalties"] = 12
    return data


def test_v1_analysis_is_recomputed_not_rejected(client, isolated_9539):
    (isolated_9539 / "_analysis.json").write_text(json.dumps(_v1_analysis(isolated_9539)))

    r = client.get("/analysis/9539")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["chaos"]["method_version"] == METHOD_VERSION
    assert "stewarding" in body["chaos"]["components"]

    # and the stale file was rewritten
    on_disk = json.loads((isolated_9539 / "_analysis.json").read_text())
    assert on_disk["chaos"]["method_version"] == METHOD_VERSION


def test_analysis_without_version_field_is_treated_as_stale(client, isolated_9539):
    data = json.loads((REAL_CACHE / "9539" / "_analysis.json").read_text())
    data["chaos"].pop("method_version")          # otherwise valid v2 content
    (isolated_9539 / "_analysis.json").write_text(json.dumps(data))
    r = client.get("/analysis/9539")
    assert r.status_code == 200
    assert r.json()["chaos"]["method_version"] == METHOD_VERSION


def test_truncated_analysis_is_analysis_failed_then_recomputes(client, isolated_9539):
    good = (REAL_CACHE / "9539" / "_analysis.json").read_text()
    (isolated_9539 / "_analysis.json").write_text(good[: len(good) // 2])   # cut mid-JSON

    r = client.get("/analysis/9539")
    assert r.status_code == 500, r.text
    err = r.json()["error"]
    assert err["code"] == "ANALYSIS_FAILED"
    assert err["details"]["reason"] == "corrupt_cache"
    assert not (isolated_9539 / "_analysis.json").exists()     # discarded

    r2 = client.get("/analysis/9539")                            # next request recomputes
    assert r2.status_code == 200
    assert (isolated_9539 / "_analysis.json").exists()


def test_fresh_v2_analysis_is_served_from_disk(client, isolated_9539, monkeypatch):
    shutil.copy(REAL_CACHE / "9539" / "_analysis.json", isolated_9539 / "_analysis.json")
    import app.api.analysis as analysis_module

    def boom(*args, **kwargs):
        raise AssertionError("should not recompute a fresh cache")
    monkeypatch.setattr(analysis_module, "compute_chaos_index", boom)

    r = client.get("/analysis/9539")
    assert r.status_code == 200
    assert r.json()["chaos"]["method_version"] == METHOD_VERSION
