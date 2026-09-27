"""
"Engineer radio offline" must say which knob is wrong, and /chat/health must not
be green while the chat is down.

Production history: the engineer chat went dead three times because GROQ_MODEL
pointed at a model Groq had decommissioned. Every time, the key was valid,
/chat/health said groq_available: true, and the user-facing message told the
reader to go and set a GROQ_API_KEY that was already set. Each incident was
diagnosed from scratch.

No test here makes a network call: the Groq model list and the Groq call are
both patched. Async paths run through asyncio.run, which is this project's
idiom — there is no pytest-asyncio, and a silently skipped async test is worse
than no test.
"""
from __future__ import annotations

import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

from app.clients import ollama_client as llm
from app.clients.ollama_client import (
    AUTH_REJECTED,
    CALL_FAILED,
    MODEL_UNAVAILABLE,
    NOT_CONFIGURED,
    PROVIDER_DOWN,
    classify_groq_failure,
    offline_reply,
)
from app.core.config import settings
from app.main import app


def http_error(status: int, body: str = "") -> httpx.HTTPStatusError:
    req = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    return httpx.HTTPStatusError("x", request=req, response=httpx.Response(status, text=body, request=req))


@pytest.fixture
def no_ollama(monkeypatch):
    """No local model, so Groq is the only path."""
    async def none(*a, **k):
        return None
    monkeypatch.setattr(llm, "_resolve_model", none)


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


# ── categories ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("exc, expected", [
    (http_error(401), AUTH_REJECTED),
    (http_error(403), AUTH_REJECTED),
    (http_error(404), MODEL_UNAVAILABLE),
    (http_error(400, '{"error":{"code":"model_not_found"}}'), MODEL_UNAVAILABLE),
    (http_error(400, "model `x` has been decommissioned"), MODEL_UNAVAILABLE),
    (http_error(400, "messages must not be empty"), CALL_FAILED),
    (http_error(500), PROVIDER_DOWN),
    (http_error(503), PROVIDER_DOWN),
    (httpx.ConnectTimeout("timed out"), PROVIDER_DOWN),
    (httpx.ConnectError("no route"), PROVIDER_DOWN),
    (ValueError("nonsense json"), CALL_FAILED),
])
def test_failures_are_classified(exc, expected):
    assert classify_groq_failure(exc) == expected


@pytest.mark.parametrize("category", [NOT_CONFIGURED, MODEL_UNAVAILABLE, AUTH_REJECTED,
                                      PROVIDER_DOWN, CALL_FAILED])
def test_every_category_has_its_own_message(category):
    r = offline_reply(category)
    assert r.provider == "offline" and r.failure == category
    assert r.answer.startswith("Engineer radio offline —")


def test_the_five_messages_are_all_different():
    msgs = {offline_reply(c).answer for c in
            (NOT_CONFIGURED, MODEL_UNAVAILABLE, AUTH_REJECTED, PROVIDER_DOWN, CALL_FAILED)}
    assert len(msgs) == 5


def test_no_key_does_not_blame_the_model_and_a_dead_model_does_not_ask_for_a_key():
    """The exact confusion that cost three diagnoses."""
    nokey = offline_reply(NOT_CONFIGURED).answer
    gone = offline_reply(MODEL_UNAVAILABLE).answer
    assert "GROQ_API_KEY" in nokey and "GROQ_MODEL" not in nokey
    assert "GROQ_MODEL" in gone and "GROQ_API_KEY" not in gone


@pytest.mark.parametrize("exc", [
    http_error(401, "Invalid API Key sk-abc123secret"),
    http_error(400, '{"error":{"message":"model_not_found: internal-trace-9f2"}}'),
    http_error(500, "upstream 10.0.0.4 refused"),
])
def test_the_message_never_carries_provider_detail(exc):
    answer = offline_reply(classify_groq_failure(exc)).answer
    for leak in ("sk-abc123secret", "internal-trace-9f2", "10.0.0.4", "500", "401"):
        assert leak not in answer


# ── the call path ────────────────────────────────────────────────────────────

def test_no_key_at_all_is_not_configured(monkeypatch, no_ollama):
    monkeypatch.setattr(settings, "groq_api_key", "")
    called = False

    async def boom(*a, **k):
        nonlocal called
        called = True
    monkeypatch.setattr(llm, "_call_groq", boom)

    r = asyncio.run(llm.answer_engineer_question("ctx", "q", "Race"))
    assert r.failure == NOT_CONFIGURED and not called


@pytest.mark.parametrize("exc, expected", [
    (http_error(404), MODEL_UNAVAILABLE),
    (http_error(401), AUTH_REJECTED),
    (http_error(502), PROVIDER_DOWN),
])
def test_a_configured_key_whose_call_fails_reports_the_reason(monkeypatch, no_ollama, exc, expected):
    monkeypatch.setattr(settings, "groq_api_key", "gsk-test")

    async def fail(*a, **k):
        raise exc
    monkeypatch.setattr(llm, "_call_groq", fail)

    async def ids(*a, **k):
        return ["openai/gpt-oss-120b"], None
    monkeypatch.setattr(llm, "groq_model_ids", ids)

    r = asyncio.run(llm.answer_engineer_question("ctx", "q", "Race"))
    assert r.provider == "offline" and r.failure == expected


def test_a_rate_limit_is_not_an_outage(monkeypatch, no_ollama):
    monkeypatch.setattr(settings, "groq_api_key", "gsk-test")

    async def throttled(*a, **k):
        raise llm.LLMRateLimited("groq", "m", 12, "slow down")
    monkeypatch.setattr(llm, "_call_groq", throttled)

    with pytest.raises(llm.LLMRateLimited):
        asyncio.run(llm.answer_engineer_question("ctx", "q", "Race"))


# ── /chat/health ─────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def clear_model_list_cache():
    """
    The cache and its lock are module state. asyncio.run gives every test a new
    loop, and a Lock that was awaited on a closed one raises, so both are reset.
    """
    llm._model_list = None
    llm._model_list_lock = asyncio.Lock()
    yield
    llm._model_list = None


def patch_model_list(monkeypatch, ids, failure=None):
    async def fake(force: bool = False):
        return ids, failure
    monkeypatch.setattr(llm, "groq_model_ids", fake)
    monkeypatch.setattr("app.api.chat.groq_model_ids", fake)


def test_health_is_not_green_just_because_a_key_is_set(client, monkeypatch):
    """The regression: valid key, decommissioned model, health said available."""
    monkeypatch.setattr(settings, "groq_api_key", "gsk-test")
    monkeypatch.setattr(settings, "groq_model", "llama-3.1-70b-versatile")   # retired
    patch_model_list(monkeypatch, ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"])

    h = client.get("/chat/health").json()
    assert h["groq_configured"] is True
    assert h["groq_available"] is False
    assert h["groq_model_available"] is False
    assert h["groq_reason"] == "model_unavailable"
    assert "llama-3.3-70b-versatile" in h["groq_available_models"]


def test_health_is_green_when_the_provider_serves_the_model(client, monkeypatch):
    monkeypatch.setattr(settings, "groq_api_key", "gsk-test")
    monkeypatch.setattr(settings, "groq_model", "openai/gpt-oss-120b")
    patch_model_list(monkeypatch, ["openai/gpt-oss-120b"])

    h = client.get("/chat/health").json()
    assert h["groq_available"] is True and h["groq_model_available"] is True
    assert h["groq_reason"] is None
    assert "groq_available_models" not in h      # only listed when something is wrong


def test_an_unreadable_model_list_is_unknown_not_available(client, monkeypatch):
    monkeypatch.setattr(settings, "groq_api_key", "gsk-test")
    patch_model_list(monkeypatch, None, PROVIDER_DOWN)

    h = client.get("/chat/health").json()
    assert h["groq_model_available"] is None     # unknown
    assert h["groq_available"] is False          # never green on a guess
    assert h["groq_reason"] == PROVIDER_DOWN


def test_no_key_says_so(client, monkeypatch):
    monkeypatch.setattr(settings, "groq_api_key", "")
    h = client.get("/chat/health").json()
    assert h["groq_configured"] is False
    assert h["groq_reason"] == NOT_CONFIGURED


def test_ai_ready_is_false_when_neither_side_can_answer(client, monkeypatch):
    monkeypatch.setattr(settings, "groq_api_key", "")
    monkeypatch.setattr(settings, "ollama_base_url", "http://127.0.0.1:1")   # nothing there
    h = client.get("/chat/health").json()
    assert h["ai_ready"] is False
    assert h["ollama_reachable"] is False and "ollama_error" in h


# ── the list is cached ───────────────────────────────────────────────────────

def test_the_model_list_is_fetched_once_within_the_ttl(monkeypatch):
    monkeypatch.setattr(settings, "groq_api_key", "gsk-test")
    calls = 0

    class FakeResponse:
        def raise_for_status(self): pass
        def json(self): return {"data": [{"id": "openai/gpt-oss-120b"}]}

    class FakeClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, *a, **k):
            nonlocal calls
            calls += 1
            return FakeResponse()

    monkeypatch.setattr(llm.httpx, "AsyncClient", lambda *a, **k: FakeClient())

    async def three_reads():
        first = await llm.groq_model_ids()
        await llm.groq_model_ids()
        await llm.groq_model_ids()
        return first

    assert asyncio.run(three_reads()) == (["openai/gpt-oss-120b"], None)
    assert calls == 1, "the list must be cached, not re-read per health check"

    assert asyncio.run(llm.groq_model_ids(force=True)) == (["openai/gpt-oss-120b"], None)
    assert calls == 2, "force must bypass the cache"


def test_a_failed_list_read_is_cached_too(monkeypatch):
    """A dead provider must not be hammered once per health check."""
    monkeypatch.setattr(settings, "groq_api_key", "gsk-test")
    calls = 0

    class FakeClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, *a, **k):
            nonlocal calls
            calls += 1
            raise httpx.ConnectError("no route")

    monkeypatch.setattr(llm.httpx, "AsyncClient", lambda *a, **k: FakeClient())

    async def two_reads():
        first = await llm.groq_model_ids()
        await llm.groq_model_ids()
        return first

    assert asyncio.run(two_reads()) == (None, PROVIDER_DOWN)
    assert calls == 1
