"""The one-off sessions completion: only adds rows, in the file's own shape. No network."""
from __future__ import annotations

import json

from scripts import complete_meeting_sessions as m

RACE = {"session_key": 9539, "session_name": "Race", "session_type": "Race",
        "date_start": "2024-06-23T13:00:00+00:00", "location": "Barcelona", "is_cancelled": False}
FETCHED = [
    {"session_key": 9532, "session_name": "Practice 1", "session_type": "Practice", "date_start": "2024-06-21T11:30:00+00:00",
     "date_end": "2024-06-21T12:30:00+00:00", "location": "Barcelona", "is_cancelled": False, "meeting_key": 1238, "year": 2024},
    {**RACE, "date_end": "2024-06-23T15:00:00+00:00", "meeting_key": 1238, "session_name": "Race (renamed upstream)"},
]


def test_only_adds_rows_and_keeps_existing_ones_untouched():
    out = m.complete([dict(RACE)], FETCHED)
    assert [r["session_key"] for r in out] == [9532, 9539]          # ordered by start
    assert out[1] == RACE                                            # the existing row, unchanged
    assert list(out[0].keys()) == list(RACE.keys())                  # the file's own fields only
    assert "date_end" not in out[0] and "meeting_key" not in out[0]


def test_serialisation_matches_the_cache_writer():
    rows = m.complete([dict(RACE)], FETCHED)
    assert m.serialise(rows) == json.dumps(rows, ensure_ascii=False, default=str)


def test_offline_by_default(monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["x"])
    monkeypatch.setattr(m, "fetch_sessions", lambda k: (_ for _ in ()).throw(AssertionError("network")))
    assert m.main() == 0
    out = capsys.readouterr().out
    assert "nothing written" in out
