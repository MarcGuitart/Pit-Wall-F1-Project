"""
scripts/list_session_keys.py — Block 30a, task 1. Race and Sprint keys from
OpenF1, without cancelled or excluded sessions; a refusal is an error, never
an empty list.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

from app.clients.openf1_client import OpenF1Error, OpenF1RateLimitError
from app.core.config import settings
from app.core.version import ANALYSIS_VERSION

BACKEND = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("list_session_keys", BACKEND / "scripts" / "list_session_keys.py")
lsk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lsk)


def row(key, name, date, circuit="X", cancelled=None, year=2024):
    r = {"session_key": key, "session_name": name, "session_type": "Race", "date_start": date,
         "circuit_short_name": circuit, "year": year}
    if cancelled is not None:
        r["is_cancelled"] = cancelled
    return r


SEASON = [
    row(9636, "Race", "2024-11-03T15:00:00+00:00", "Interlagos"),
    row(9635, "Sprint", "2024-11-02T14:00:00+00:00", "Interlagos"),
    row(9500, "Race", "2024-03-02T15:00:00+00:00", "Sakhir"),
    row(9501, "Qualifying", "2024-03-01T16:00:00+00:00"),         # not Race/Sprint by name
    row(9086, "Race", "2023-05-21T13:00:00+00:00", "Imola", cancelled=True),
    row(9087, "Race", "2024-05-21T13:00:00+00:00", "Y", cancelled="true"),  # not the boolean: kept
    row(11261, "Race", "2026-04-12T15:00:00+00:00", "Sakhir"),   # in the exclusions file
]


@pytest.fixture
def openf1(monkeypatch):
    state = {"answer": SEASON}

    async def fake(endpoint, **params):
        assert endpoint == "sessions" and params.get("session_type") == "Race"
        a = state["answer"]
        if isinstance(a, Exception):
            raise a
        return a

    monkeypatch.setattr(lsk, "fetch_json", fake)
    return state


def test_race_and_sprint_without_cancelled_or_excluded_oldest_first(openf1, capsys):
    assert lsk.main(["2024", "--format", "dispatch"]) == 0
    assert capsys.readouterr().out.strip() == "9500,9087,9635,9636"


def test_the_dispatch_format_is_the_workflow_input_exactly(openf1, capsys):
    lsk.main(["2024", "--format", "dispatch"])
    out = capsys.readouterr().out.strip()
    assert " " not in out and out.count(",") == 3
    assert all(part.isdigit() for part in out.split(","))


def test_a_429_is_an_error_not_an_empty_list(openf1, capsys):
    openf1["answer"] = OpenF1RateLimitError("sessions", 4)
    assert lsk.main(["2024", "--format", "dispatch"]) == 2
    captured = capsys.readouterr()
    assert captured.out == "" and "ERROR" in captured.err


def test_a_body_that_is_not_a_list_is_an_error(openf1, capsys):
    openf1["answer"] = {"detail": "Too Many Requests"}
    assert lsk.main(["2024"]) == 2
    assert capsys.readouterr().out == ""


def test_any_openf1_error_is_an_error(openf1, capsys):
    openf1["answer"] = OpenF1Error("sessions", 3, "down")
    assert lsk.main(["2024"]) == 2


def test_missing_leaves_out_what_is_already_published(openf1, capsys, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "cache_dir", str(tmp_path))
    d = tmp_path / "9636"
    d.mkdir()
    (d / "_analysis.json").write_text(json.dumps({"analysis_version": ANALYSIS_VERSION, "race": {}}))
    stale = tmp_path / "9500"
    stale.mkdir()
    (stale / "_analysis.json").write_text(json.dumps({"analysis_version": "1", "race": {}}))
    lsk.main(["2024", "--missing", "--format", "dispatch"])
    assert capsys.readouterr().out.strip() == "9500,9087,9635"   # 9500 is stale: still missing
