"""
/sessions/{key}/meta's cold path — Block 27b.

A session not on disk costs OpenF1 reads on a public endpoint. Guarded by a
bounded memo with TTL, one flight per key and a limit per IP on the requests
that start a flight. A session on disk never reaches OpenF1.
"""
from __future__ import annotations

import asyncio

import httpx
import pytest

from app.api import session_meta as meta_api
from app.clients.openf1_client import OpenF1Error
from app.core.config import settings
from app.main import app

ROW = {"session_key": 0, "meeting_key": 1308, "session_name": "Race", "session_type": "Race",
       "date_start": "2026-10-04T07:00:00+00:00", "date_end": "2026-10-04T09:00:00+00:00",
       "location": "Kuala Lumpur", "circuit_short_name": "Kuala Lumpur", "year": 2026,
       "meeting_name": "Bahrain Grand Prix"}


@pytest.fixture(autouse=True)
def clean(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "cache_dir", str(tmp_path))   # nothing on disk: every key is cold
    meta_api._reset_for_tests()
    yield
    meta_api._reset_for_tests()


@pytest.fixture
def openf1(monkeypatch):
    """Counts reads per endpoint; `answer(key)` decides the sessions reply."""
    calls: list[tuple[str, int | None]] = []
    state = {"answer": lambda key: [{**ROW, "session_key": key}], "delay": 0.0}

    async def fake_fetch(endpoint, **params):
        calls.append((endpoint, params.get("session_key")))
        await asyncio.sleep(state["delay"])
        if endpoint == "sessions":
            result = state["answer"](params["session_key"])
            if isinstance(result, Exception):
                raise result
            return result
        return [{"meeting_name": "X"}]

    monkeypatch.setattr(meta_api, "fetch_json", fake_fetch)
    return calls, state


def get(*paths, ip="10.0.0.1"):
    async def go():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
            return await asyncio.gather(*(c.get(p, headers={"x-forwarded-for": ip}) for p in paths))
    return asyncio.run(go())


def test_concurrent_askers_share_one_flight(openf1):
    calls, state = openf1
    state["delay"] = 0.2
    rs = get(*["/sessions/11731/meta"] * 6)
    assert all(r.status_code == 200 for r in rs)
    assert calls.count(("sessions", 11731)) == 1


def test_an_answer_is_memoised_until_its_ttl(openf1, monkeypatch):
    calls, _ = openf1
    now = {"t": 1000.0}
    monkeypatch.setattr(meta_api._memo, "clock", lambda: now["t"])
    get("/sessions/11731/meta")
    get("/sessions/11731/meta")
    assert calls.count(("sessions", 11731)) == 1
    now["t"] += meta_api.NETWORK_TTL_S + 1
    get("/sessions/11731/meta")
    assert calls.count(("sessions", 11731)) == 2


def test_not_found_is_memoised_too_but_shorter(openf1, monkeypatch):
    calls, state = openf1
    state["answer"] = lambda key: []
    now = {"t": 1000.0}
    monkeypatch.setattr(meta_api._memo, "clock", lambda: now["t"])
    assert get("/sessions/424242/meta")[0].status_code == 404
    assert get("/sessions/424242/meta")[0].status_code == 404
    assert calls.count(("sessions", 424242)) == 1
    now["t"] += meta_api.NOT_FOUND_TTL_S + 1
    get("/sessions/424242/meta")
    assert calls.count(("sessions", 424242)) == 2


def test_a_failure_is_not_memoised(openf1):
    calls, state = openf1
    state["answer"] = lambda key: OpenF1Error("sessions", 3, "down")
    assert get("/sessions/11731/meta")[0].status_code == 503
    state["answer"] = lambda key: [{**ROW, "session_key": key}]
    assert get("/sessions/11731/meta")[0].status_code == 200
    assert calls.count(("sessions", 11731)) == 2


def test_the_limit_is_per_ip_and_counts_only_flights(openf1):
    calls, _ = openf1
    limit = meta_api.COLD_LIMIT_PER_IP
    for k in range(limit):
        assert get(f"/sessions/{90000 + k}/meta")[0].status_code == 200
    r = get("/sessions/99999/meta")[0]
    assert r.status_code == 429
    err = r.json()["error"]
    assert err["code"] == "RATE_LIMITED" and err["details"]["retry_after_seconds"] >= 1
    # A memo hit costs nothing, even over the limit…
    assert get("/sessions/90000/meta")[0].status_code == 200
    # …and another network has its own budget.
    assert get("/sessions/99999/meta", ip="10.0.0.2")[0].status_code == 200
    assert ("sessions", 99999) in calls and calls.count(("sessions", 99999)) == 1


def test_the_memo_is_bounded(monkeypatch):
    memo = meta_api._Memo(clock=lambda: 0.0)
    monkeypatch.setattr(meta_api, "MEMO_MAX", 3)
    for k in range(5):
        memo.put(k, {"k": k}, 60)
    assert len(memo) == 3
    assert memo.get(0) is None and memo.get(4) == {"k": 4}


def test_a_session_on_disk_never_reaches_openf1(monkeypatch):
    """The hot path: the real cache has 9539. The OpenF1 client is mocked to fail if called."""
    monkeypatch.undo()  # back to the real cache dir
    meta_api._reset_for_tests()

    async def refuse(*a, **k):
        raise AssertionError("OpenF1 called for a session on disk")

    monkeypatch.setattr(meta_api, "fetch_json", refuse)
    r = get("/sessions/9539/meta")[0]
    assert r.status_code == 200 and r.json()["location"] == "Barcelona"
