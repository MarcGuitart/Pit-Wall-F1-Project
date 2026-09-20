"""
/chat cited_signals: taken from the model's structured reply and validated
against the engineer-note catalogue of the cached analysis (9539). Never
invented: unknown ids are dropped, no block means an empty list.
"""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.api import chat as chat_module
from app.clients.ollama_client import EngineerReply, parse_reply
from app.core import cache
from app.domain.models import FullRaceAnalysis
from app.main import app
from app.services.chat_service import build_chat_context, signal_catalog


@pytest.fixture
def analysis_9539():
    raw = cache.get_full_analysis(9539)
    if raw is None:
        pytest.skip("cache/9539/_analysis.json not present")
    return FullRaceAnalysis.model_validate(raw)


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(chat_module, "_session_limiter", chat_module.SlidingWindow(1000, 60))
    monkeypatch.setattr(chat_module, "_ip_limiter", chat_module.SlidingWindow(1000, 60))
    return TestClient(app, raise_server_exceptions=False)


def _stub(monkeypatch, reply: EngineerReply):
    async def canned(*args, **kwargs):
        return reply
    monkeypatch.setattr(chat_module, "answer_engineer_question", canned)


def ask(client):
    return client.post("/chat", json={"session_key": 9539, "question": "what happened?"})


# ── catalogue / context ──────────────────────────────────────────────────────

def test_catalogue_ids_are_stable_and_in_context(analysis_9539):
    catalog = signal_catalog(analysis_9539)
    assert list(catalog) == [f"S{i}" for i in range(1, len(analysis_9539.engineer_notes) + 1)]
    ctx = json.loads(build_chat_context(analysis_9539))
    assert [s["id"] for s in ctx["signals"]] == list(catalog)
    assert "top_signals" not in ctx


# ── parse_reply ──────────────────────────────────────────────────────────────

def test_parse_reply_structured_and_fenced():
    body = {"answer": "VER pitted L45.", "cited_signal_ids": ["S2", "S5"], "confidence": "High"}
    assert parse_reply(json.dumps(body)) == ("VER pitted L45.", ["S2", "S5"], "High")
    assert parse_reply("```json\n" + json.dumps(body) + "\n```") == ("VER pitted L45.", ["S2", "S5"], "High")


def test_parse_reply_plain_text_has_no_citations_or_confidence():
    assert parse_reply("Just prose. Confidence: High") == ("Just prose. Confidence: High", [], None)


def test_parse_reply_ignores_malformed_fields():
    body = {"answer": "ok", "cited_signal_ids": "S1", "confidence": "Certain"}
    assert parse_reply(json.dumps(body)) == ("ok", [], None)


# ── /chat validation ─────────────────────────────────────────────────────────

def test_valid_ids_are_returned_with_lap_and_title(client, monkeypatch, analysis_9539):
    catalog = signal_catalog(analysis_9539)
    first, second = list(catalog)[:2]
    _stub(monkeypatch, EngineerReply("A.", "groq", "m", [second, first, second], "High"))

    body = ask(client).json()
    assert [c["id"] for c in body["cited_signals"]] == [second, first]      # order kept, duplicate dropped
    assert body["cited_signals"][0]["title"] == catalog[second].title
    assert body["cited_signals"][0]["lap_number"] == catalog[second].lap_number
    assert body["confidence"] == "High"
    assert body["provider"] == "groq" and body["model"] == "m"


def test_invented_ids_are_dropped(client, monkeypatch, analysis_9539):
    real = next(iter(signal_catalog(analysis_9539)))
    _stub(monkeypatch, EngineerReply("A.", "groq", "m", ["S999", "note-42", real, ""], "Medium"))

    body = ask(client).json()
    assert [c["id"] for c in body["cited_signals"]] == [real]


def test_missing_block_gives_empty_citations_and_no_confidence(client, monkeypatch):
    _stub(monkeypatch, EngineerReply("Plain prose answer.", "ollama", "llama3.1:8b"))

    body = ask(client).json()
    assert body["answer"] == "Plain prose answer."
    assert body["cited_signals"] == []
    assert body["confidence"] is None


def test_provider_rate_limit_is_not_reported_as_offline(client, monkeypatch):
    from app.clients.ollama_client import LLMRateLimited

    async def throttled(*args, **kwargs):
        raise LLMRateLimited("groq", "openai/gpt-oss-120b", 12, "TPM limit")
    monkeypatch.setattr(chat_module, "answer_engineer_question", throttled)

    r = ask(client)
    assert r.status_code == 503
    err = r.json()["error"]
    assert err["code"] == "LLM_RATE_LIMITED"
    assert err["details"] == {"provider": "groq", "model": "openai/gpt-oss-120b", "retry_after_seconds": 12}
    assert "12 s" in err["message"]
