"""
LIVE_PREDICTIONS: the projection is off unless asked for.

Off (the default, unset included) the live server's snapshot carries no
"projection" field at all — the deployed page then shows its "not available"
state for the Predictions tab and the Engineer AI digest skips the section.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "scripts"))

import live_state  # noqa: E402
from live_state import RaceState  # noqa: E402

spec = importlib.util.spec_from_file_location("live_server", BACKEND / "scripts" / "live_server.py")
live_server = sys.modules.get("live_server") or importlib.util.module_from_spec(spec)
if "live_server" not in sys.modules:
    sys.modules["live_server"] = live_server
    spec.loader.exec_module(live_server)


def a_race() -> RaceState:
    s = RaceState(session_key=11377)
    s.race_distance = 51
    for dn, code in ((1, "AAA"), (2, "BBB"), (3, "CCC")):
        s.ingest("v1/drivers", {"driver_number": dn, "name_acronym": code, "_key": f"d{dn}"}, recv=1000.0)
    for ln in range(1, 9):
        for dn in (1, 2, 3):
            s.ingest("v1/laps", {"driver_number": dn, "lap_number": ln, "lap_duration": 100.0 + dn / 10,
                                 "_key": f"l{dn}_{ln}"}, recv=1000.0 + ln * 100 + dn)
    for dn in (1, 2, 3):
        s.ingest("v1/position", {"driver_number": dn, "position": dn, "date": "2026-09-26T11:20:00",
                                 "_key": f"p{dn}"}, recv=1900.0)
        s.ingest("v1/intervals", {"driver_number": dn, "gap_to_leader": (dn - 1) * 3.0, "interval": 3.0,
                                  "date": "2026-09-26T11:20:00", "_key": f"i{dn}"}, recv=1900.0)
    return s


@pytest.mark.parametrize("value", [None, "", "off", "OFF", "0", "false", "maybe"])
def test_off_by_default_and_for_anything_but_on(value, monkeypatch):
    if value is None:
        monkeypatch.delenv("LIVE_PREDICTIONS", raising=False)
    else:
        monkeypatch.setenv("LIVE_PREDICTIONS", value)
    assert live_state.predictions_enabled() is False
    snap = a_race().snapshot(include_analysis=True)
    assert "projection" not in snap
    # everything else the page reads is still there
    assert "dashboard" in snap and "analysis" in snap and "tower" in snap


@pytest.mark.parametrize("value", ["on", "ON", "1", "true", " yes "])
def test_on_emits_the_projection(value, monkeypatch):
    monkeypatch.setenv("LIVE_PREDICTIONS", value)
    assert live_state.predictions_enabled() is True
    snap = a_race().snapshot(include_analysis=True)
    assert "projection" in snap and snap["projection"]["kind"] == "race"


def test_the_server_payload_follows_the_flag(monkeypatch):
    """What /live/{key}/snapshot and the SSE stream send is snapshot_payload."""
    monkeypatch.delenv("LIVE_PREDICTIONS", raising=False)
    off = live_server.snapshot_payload(a_race(), live_server.Hub(), None)
    assert "projection" not in off and off["feed"]["mode"] == "replay"
    monkeypatch.setenv("LIVE_PREDICTIONS", "on")
    on = live_server.snapshot_payload(a_race(), live_server.Hub(), None)
    assert "projection" in on


def test_without_analysis_there_is_never_a_projection(monkeypatch):
    monkeypatch.setenv("LIVE_PREDICTIONS", "on")
    assert "projection" not in a_race().snapshot(include_analysis=False)
