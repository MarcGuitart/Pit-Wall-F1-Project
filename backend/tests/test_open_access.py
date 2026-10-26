"""
The open week (block 50): OPEN_ACCESS_UNTIL opens every PRO check until that instant.

The clock is frozen (access._now) before and after the date; without the variable everything is as it was. No
network: as in test_pro_access.py, a request that passes the gate then fails on the cut-off network, so what is
asserted for an open gate is "not PRO_REQUIRED", and for a closed one the 402 itself.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.core import access
from app.core.config import settings
from app.main import app

UNTIL = "2026-11-03T10:00:00+01:00"            # Tue 3 Nov, 10:00 CET
BEFORE = datetime(2026, 11, 3, 8, 59, 59, tzinfo=timezone.utc)
AFTER = datetime(2026, 11, 3, 9, 0, 0, tzinfo=timezone.utc)   # 10:00 CET exactly: closed


@pytest.fixture
def configured(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "pro_access_codes", ["PW-test-code"])
    monkeypatch.setattr(settings, "pro_token_secret", SecretStr("test-secret"))
    monkeypatch.setattr(settings, "free_seasons", [2023, 2024])
    monkeypatch.setattr(settings, "cache_dir", str(tmp_path))
    monkeypatch.delenv("OPEN_ACCESS_UNTIL", raising=False)
    d = tmp_path / "11377"
    d.mkdir()
    (d / "_session_meta.json").write_text(json.dumps({
        "session_key": 11377, "year": 2026, "meeting_name": "Test Grand Prix",
        "session_name": "Race", "session_type": "Race",
        "date_start": "2026-09-20T11:00:00+00:00", "date_end": "2026-09-20T13:00:00+00:00",
    }))
    return tmp_path


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    async def refuse(*args, **kwargs):
        raise AssertionError("an open-week test tried to reach the network")
    import app.api.analysis as analysis_api
    import app.clients.openf1_client as openf1
    monkeypatch.setattr(openf1, "fetch_json", refuse)
    monkeypatch.setattr(analysis_api, "fetch_json", refuse)
    monkeypatch.setattr(analysis_api, "load_session", refuse)
    monkeypatch.setattr(analysis_api, "_fetch_session_meta", refuse)


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


def frozen(monkeypatch, at: datetime):
    monkeypatch.setattr(access, "_now", lambda: at)


def gate(r) -> str | None:
    return (r.json().get("error") or {}).get("code") if r.headers.get("content-type", "").startswith("application/json") else None


def test_without_the_variable_everything_is_as_today(client, configured, monkeypatch):
    frozen(monkeypatch, BEFORE)
    assert client.get("/access/open").json() == {"open": False, "until": None}
    r = client.get("/analysis/11377")
    assert r.status_code == 402 and gate(r) == "PRO_REQUIRED"


def test_before_the_date_every_pro_check_is_open(client, configured, monkeypatch):
    monkeypatch.setenv("OPEN_ACCESS_UNTIL", UNTIL)
    frozen(monkeypatch, BEFORE)
    body = client.get("/access/open").json()
    assert body["open"] is True
    assert datetime.fromisoformat(body["until"]) == datetime.fromisoformat(UNTIL)
    r = client.get("/analysis/11377")                       # a 2026 race, no token
    assert r.status_code != 402 and gate(r) != "PRO_REQUIRED"
    r = client.post("/chat", json={"session_key": 11377, "question": "Who won?", "messages": []})
    assert gate(r) != "PRO_REQUIRED"


def test_at_and_after_the_date_it_closes_by_itself(client, configured, monkeypatch):
    monkeypatch.setenv("OPEN_ACCESS_UNTIL", UNTIL)
    frozen(monkeypatch, AFTER)
    body = client.get("/access/open").json()
    assert body["open"] is False and body["until"] is not None
    r = client.get("/analysis/11377")
    assert r.status_code == 402 and gate(r) == "PRO_REQUIRED"


@pytest.mark.parametrize("value", ["2026-11-03T10:00:00", "next tuesday", "2026-13-40T10:00:00+01:00", " "])
def test_an_unusable_value_opens_nothing(client, configured, monkeypatch, value):
    monkeypatch.setenv("OPEN_ACCESS_UNTIL", value)
    frozen(monkeypatch, BEFORE)
    assert client.get("/access/open").json() == {"open": False, "until": None}
    assert client.get("/analysis/11377").status_code == 402


def test_changing_the_variable_takes_effect_without_a_restart(client, configured, monkeypatch):
    frozen(monkeypatch, BEFORE)
    assert client.get("/analysis/11377").status_code == 402
    monkeypatch.setenv("OPEN_ACCESS_UNTIL", UNTIL)
    assert client.get("/analysis/11377").status_code != 402
    monkeypatch.setenv("OPEN_ACCESS_UNTIL", "2026-11-01T00:00:00+00:00")   # closed early
    assert client.get("/analysis/11377").status_code == 402


def test_access_open_is_public_and_cacheable_briefly(client, configured, monkeypatch):
    monkeypatch.setenv("OPEN_ACCESS_UNTIL", UNTIL)
    frozen(monkeypatch, BEFORE)
    r = client.get("/access/open")
    assert r.status_code == 200
    assert r.headers["cache-control"] == "public, max-age=60"


def test_the_token_still_matters_outside_the_week(configured, monkeypatch):
    frozen(monkeypatch, AFTER)
    monkeypatch.setenv("OPEN_ACCESS_UNTIL", UNTIL)
    assert access.is_open_access() is False
    assert access.is_open_access(BEFORE) is True
