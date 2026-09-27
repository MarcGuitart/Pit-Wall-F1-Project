"""
Regression: Groq starved on max_tokens before it ever wrote the JSON answer.

Production incident (Block 18, 2026-09): a Verstappen question against 11377
failed with Groq 400 json_validate_failed and an EMPTY failed_generation — not
malformed JSON, no JSON at all. openai/gpt-oss-120b is a reasoning model: it
spends completion tokens on a hidden reasoning trace before the JSON answer,
and that trace's length tracks the question's difficulty, not the length of the
eventual answer. max_tokens=600 was sized for the answer alone and the trace
alone could exhaust it, so `_call_groq` returned nothing to parse.

Reproduced locally against a real Groq call (not committed here — this file
makes none) with the exact question from the incident, before and after the
fix: 400/empty at 600, a full four-sentence answer at 4000.

No network: the payload is inspected directly, and the exact 400 response the
incident logged is replayed through a MockTransport.
"""
from __future__ import annotations

import httpx
import pytest

from app.clients import ollama_client as llm
from app.core.config import settings

# The literal body Groq returned in production for the Verstappen question.
STARVED_400_BODY = (
    '{"error":{"message":"Failed to validate JSON. Please adjust your prompt. '
    'See \'failed_generation\' for more details.","type":"invalid_request_error",'
    '"code":"json_validate_failed","failed_generation":""}}'
)


@pytest.fixture(autouse=True)
def groq_configured(monkeypatch):
    monkeypatch.setattr(settings, "groq_api_key", "gsk-test")
    monkeypatch.setattr(settings, "groq_model", "openai/gpt-oss-120b")


def captured_payload(monkeypatch) -> dict:
    """Intercept the request _call_groq builds, answer with a valid reply, and
    hand the payload back so the test can inspect what was actually sent."""
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        import json
        seen["payload"] = json.loads(request.content)
        return httpx.Response(200, json={
            "choices": [{"message": {"content":
                '{"answer": "ok", "cited_signal_ids": [], "confidence": "Low"}'}}]
        })

    class Patched(httpx.AsyncClient):
        def __init__(self, *a, **k):
            k["transport"] = httpx.MockTransport(handler)
            super().__init__(*a, **k)

    monkeypatch.setattr(llm.httpx, "AsyncClient", Patched)
    return seen


def test_the_request_asks_for_a_generous_token_budget(monkeypatch):
    """
    The floor here is not the exact number (that may be tuned again) but that it
    is far above what an answer alone needs — 600 was already generous for a
    2-4 sentence answer, and it was still exhausted by hidden reasoning tokens.
    """
    seen = captured_payload(monkeypatch)
    import asyncio
    asyncio.run(llm._call_groq("system", "question"))
    assert seen["payload"]["max_tokens"] >= 2000


def test_reasoning_models_are_not_starved_by_the_old_budget():
    """The regression itself, pinned as a number: 600 must never come back."""
    assert llm.__dict__ or True  # keep flake8 quiet about an otherwise-empty test
    import re
    import inspect
    source = inspect.getsource(llm._call_groq)
    match = re.search(r'"max_tokens":\s*(\d+)', source)
    assert match, "max_tokens must be a literal in the payload, not computed elsewhere"
    assert int(match.group(1)) >= 2000, (
        "this is exactly the incident: 600 was enough for the answer but not "
        "for a reasoning model's hidden trace ahead of it"
    )


def test_the_exact_production_failure_is_classified_as_call_failed_not_model_unavailable(monkeypatch):
    """
    An empty failed_generation on a 400 is a starved budget, not a bad model
    name — classify_groq_failure must not send the reader chasing GROQ_MODEL for
    a problem that was never about which model was configured.
    """
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, text=STARVED_400_BODY)

    class Patched(httpx.AsyncClient):
        def __init__(self, *a, **k):
            k["transport"] = httpx.MockTransport(handler)
            super().__init__(*a, **k)

    monkeypatch.setattr(llm.httpx, "AsyncClient", Patched)

    import asyncio
    with pytest.raises(httpx.HTTPStatusError) as exc_info:
        asyncio.run(llm._call_groq("system", "question"))

    assert llm.classify_groq_failure(exc_info.value) == llm.CALL_FAILED
