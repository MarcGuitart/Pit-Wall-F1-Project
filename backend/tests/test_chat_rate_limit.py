"""
/chat rate limit: sliding window per browser session (X-Client-Id) with a
higher per-IP cap. The LLM call is stubbed; the analysis comes from the real
9539 cache.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api import chat as chat_module
from app.clients.ollama_client import EngineerReply
from app.core.ratelimit import SlidingWindow
from app.main import app


class FakeClock:
    def __init__(self) -> None:
        self.now = 1_000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def clock():
    return FakeClock()


@pytest.fixture
def client(monkeypatch, clock):
    """Small limits (session 3 / ip 5 per 60 s) on a fake clock; LLM stubbed."""
    monkeypatch.setattr(chat_module, "_session_limiter", SlidingWindow(3, 60, clock))
    monkeypatch.setattr(chat_module, "_ip_limiter", SlidingWindow(5, 60, clock))

    async def canned(*args, **kwargs):
        return EngineerReply("Copy that.", "groq", "stub-model")
    monkeypatch.setattr(chat_module, "answer_engineer_question", canned)
    return TestClient(app, raise_server_exceptions=False)


def ask(client, client_id: str | None, ip: str = "203.0.113.7"):
    headers = {"X-Forwarded-For": ip}
    if client_id:
        headers["X-Client-Id"] = client_id
    return client.post("/chat", json={"session_key": 9539, "question": "why?"}, headers=headers)


# ── SlidingWindow unit ───────────────────────────────────────────────────────

def test_window_allows_up_to_limit_then_reports_wait(clock):
    w = SlidingWindow(2, 10, clock)
    assert w.retry_after("k") == 0.0; w.hit("k")
    assert w.retry_after("k") == 0.0; w.hit("k")
    assert w.retry_after("k") == pytest.approx(10.0)
    clock.now += 4
    assert w.retry_after("k") == pytest.approx(6.0)
    clock.now += 6
    assert w.retry_after("k") == 0.0          # oldest hit expired


def test_window_keys_are_independent(clock):
    w = SlidingWindow(1, 10, clock)
    w.hit("a")
    assert w.retry_after("a") > 0
    assert w.retry_after("b") == 0.0


# ── /chat endpoint ───────────────────────────────────────────────────────────

def test_below_the_session_limit_passes(client):
    for _ in range(3):
        r = ask(client, "browser-A")
        assert r.status_code == 200, r.text
        assert r.json()["answer"] == "Copy that."


def test_above_the_session_limit_is_429_rate_limited(client):
    for _ in range(3):
        assert ask(client, "browser-A").status_code == 200
    r = ask(client, "browser-A")
    assert r.status_code == 429
    err = r.json()["error"]
    assert err["code"] == "RATE_LIMITED"
    assert err["details"]["scope"] == "session"
    assert err["details"]["limit"] == 3
    assert 1 <= err["details"]["retry_after_seconds"] <= 61
    assert str(err["details"]["retry_after_seconds"]) in err["message"]


def test_other_sessions_on_the_same_ip_keep_working(client):
    for _ in range(3):
        assert ask(client, "browser-A").status_code == 200
    assert ask(client, "browser-A").status_code == 429
    assert ask(client, "browser-B").status_code == 200   # classroom behind one NAT


def test_ip_cap_is_the_secondary_limit(client):
    # 5 different browsers, one message each -> IP cap of 5 reached
    for i in range(5):
        assert ask(client, f"browser-{i}").status_code == 200
    r = ask(client, "browser-new")
    assert r.status_code == 429
    assert r.json()["error"]["details"]["scope"] == "ip"
    # a different IP is unaffected
    assert ask(client, "browser-new", ip="198.51.100.9").status_code == 200


def test_rejected_requests_do_not_consume_quota(client, clock):
    for _ in range(3):
        assert ask(client, "browser-A").status_code == 200
    for _ in range(10):
        assert ask(client, "browser-A").status_code == 429
    clock.now += 61
    assert ask(client, "browser-A").status_code == 200


def test_window_frees_up_when_it_expires(client, clock):
    for _ in range(3):
        assert ask(client, "browser-A").status_code == 200
    assert ask(client, "browser-A").status_code == 429
    clock.now += 30
    assert ask(client, "browser-A").status_code == 429    # still inside the window
    clock.now += 31
    assert ask(client, "browser-A").status_code == 200    # oldest hit expired


def test_missing_client_id_falls_back_to_ip_key(client):
    for _ in range(3):
        assert ask(client, None).status_code == 200
    r = ask(client, None)
    assert r.status_code == 429
    assert r.json()["error"]["details"]["scope"] == "session"
