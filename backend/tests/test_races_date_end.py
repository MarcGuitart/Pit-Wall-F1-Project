"""
/races/{meeting_key}/sessions carries date_end.

Added for the landing page's "Race ends [time] UTC" copy (Block 19). Before
this, SessionInfo only had date_start — a session's own scheduled end was
readable server-side (analysis.py's historical gate already uses it) but never
reached the frontend, which had nothing to build that copy from.
"""
from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from app.clients import openf1_client
from app.core.config import settings
from app.main import app
from pydantic import SecretStr

PRO_CODE = "races-date-end-test-code"


@pytest.fixture(autouse=True)
def pro_access(monkeypatch):
    """/races is not PRO-gated, but keep the pattern consistent with the rest
    of this test suite in case that ever changes."""
    monkeypatch.setattr(settings, "pro_access_codes", [PRO_CODE])
    monkeypatch.setattr(settings, "pro_token_secret", SecretStr("races-date-end-test-secret"))


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def fake_openf1(monkeypatch):
    monkeypatch.setattr(openf1_client, "_BACKOFF", [0, 0, 0, 0])
    real = httpx.AsyncClient

    def install(handler):
        class Patched(real):
            def __init__(self, *args, **kwargs):
                kwargs["transport"] = httpx.MockTransport(handler)
                super().__init__(*args, **kwargs)
        monkeypatch.setattr(httpx, "AsyncClient", Patched)

    return install


def test_sessions_carry_date_end(client, fake_openf1, monkeypatch):
    from app.core import cache
    monkeypatch.setattr(cache, "get_sessions_for_meeting", lambda *_: None)
    monkeypatch.setattr(cache, "set_sessions_for_meeting", lambda *_: None)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[{
            "session_key": 99001,
            "session_name": "Race",
            "session_type": "Race",
            "date_start": "2026-11-08T13:00:00+00:00",
            "date_end": "2026-11-08T15:00:00+00:00",
        }])

    fake_openf1(handler)
    r = client.get("/races/9999/sessions")
    assert r.status_code == 200
    body = r.json()
    assert body[0]["date_end"] == "2026-11-08T15:00:00+00:00"


def test_a_session_with_no_date_end_yet_is_still_served(client, fake_openf1, monkeypatch):
    """A calendar entry far enough out that OpenF1 has not scheduled the exact
    end must not break the endpoint — Optional, not required."""
    from app.core import cache
    monkeypatch.setattr(cache, "get_sessions_for_meeting", lambda *_: None)
    monkeypatch.setattr(cache, "set_sessions_for_meeting", lambda *_: None)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[{
            "session_key": 99002,
            "session_name": "Race",
            "session_type": "Race",
            "date_start": "2026-11-08T13:00:00+00:00",
        }])

    fake_openf1(handler)
    r = client.get("/races/9999/sessions")
    assert r.status_code == 200
    assert r.json()[0]["date_end"] is None
