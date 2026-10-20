"""The one-off date_end backfill: only the date_end key appears, in place.

No network: the transform functions are tested on in-memory rows.
"""
from __future__ import annotations

import json

from scripts import add_meeting_date_end as m

ROWS = [
    {"meeting_key": 1, "meeting_name": "Bahrain Grand Prix", "date_start": "2024-02-29T11:30:00+00:00", "year": 2024},
    {"meeting_key": 2, "meeting_name": "São Paulo Grand Prix", "date_start": "2024-11-01T14:30:00+00:00", "year": 2024},
]
SESSIONS = [
    {"meeting_key": 1, "date_end": "2024-02-29T12:30:00+00:00"},
    {"meeting_key": 1, "date_end": "2024-03-02T17:00:00+00:00"},
    {"meeting_key": 1, "date_end": "2024-03-01T16:00:00+00:00"},
    {"meeting_key": 2, "date_end": None},
]


def test_weekend_end_is_the_latest_session_end():
    assert m.weekend_ends(SESSIONS) == {1: "2024-03-02T17:00:00+00:00"}


def test_date_end_goes_right_after_date_start_and_nothing_else_changes():
    out = m.with_date_end(ROWS, m.weekend_ends(SESSIONS))
    assert list(out[0]) == ["meeting_key", "meeting_name", "date_start", "date_end", "year"]
    assert out[1] == ROWS[1]
    assert {k: v for k, v in out[0].items() if k != "date_end"} == ROWS[0]


def test_serialisation_matches_the_cache_writer():
    raw = m.serialise(ROWS)
    assert raw == json.dumps(ROWS, ensure_ascii=False, default=str)
    assert "São Paulo" in raw


def test_existing_date_end_is_kept():
    row = {**ROWS[0], "date_end": "keep"}
    assert m.with_date_end([row], {1: "other"})[0]["date_end"] == "keep"


def test_offline_by_default(monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["x"])
    monkeypatch.setattr(m, "fetch_sessions", lambda y: (_ for _ in ()).throw(AssertionError("network")))
    assert m.main() == 0
    assert "nothing written" in capsys.readouterr().out
