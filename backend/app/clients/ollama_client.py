"""
AI client — tries Ollama (local) first, falls back to Groq (free cloud).

Priority:
  1. Ollama — if running locally with a model pulled
  2. Groq  — if GROQ_API_KEY is set (free tier, no local model needed)
  3. Offline message
"""
from __future__ import annotations

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

ENGINEER_SYSTEM_PROMPT = """You are a race engineer analysing the {session_name} session.
The computed analysis below is your primary data source. Use it to give specific, grounded answers.

Rules:
- Always try to answer. Use the analysis data directly — cite lap numbers, driver codes, times.
- If a number or fact is present in the analysis, use it. If it is genuinely absent, say briefly what you have and what you don't, then give your best engineering judgement.
- Do NOT refuse with "insufficient analysis" when the relevant data IS in the context.
- 2-4 sentences maximum. Direct, pit wall tone.
- Cite laps and signals when available (e.g. "Lap 45 — VER pitted, net +2 positions").
- End with: Confidence: Low / Medium / High
- No markdown, no bullet points.

{focused_driver_note}

Computed analysis:
{context}"""


async def _resolve_model() -> str | None:
    """Return the preferred model if available, else the first available model, else None."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{settings.ollama_base_url}/api/tags")
            r.raise_for_status()
            models = [m["name"] for m in r.json().get("models", [])]
    except Exception:
        return None

    if not models:
        return None
    # Prefer configured model; fall back to first available
    preferred = settings.ollama_model
    if any(m == preferred or m.startswith(preferred.split(":")[0] + ":") for m in models):
        return preferred
    return models[0]


async def call_ollama(
    context: str,
    question: str,
    session_name: str,
    focused_driver: str | None = None,
) -> str:
    """
    Send a question to Ollama with the compact race context injected into
    the system prompt.  Returns the model's answer as plain text.
    """
    model = await _resolve_model()
    if model is None:
        return (
            "Engineer radio offline — no Ollama model is ready yet. "
            f"Run: ollama pull {settings.ollama_model}"
        )

    if focused_driver:
        focused_driver_note = (
            f"The user is specifically asking about driver {focused_driver}. "
            f"Prioritise data for that driver."
        )
    else:
        focused_driver_note = ""

    system = ENGINEER_SYSTEM_PROMPT.format(
        session_name=session_name,
        context=context,
        focused_driver_note=focused_driver_note,
    )

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": question},
        ],
        "stream": False,
        "options": {
            "temperature": 0.3,
            "num_predict": 200,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(
                f"{settings.ollama_base_url}/api/chat", json=payload
            )
            r.raise_for_status()
            data = r.json()
            logger.info("[OLLAMA] answered with model=%s", model)
            return data["message"]["content"].strip()
    except httpx.ConnectError:
        logger.warning("Ollama not reachable at %s", settings.ollama_base_url)
        return "Engineer radio unavailable. Check that Ollama is running: brew services start ollama"
    except httpx.HTTPStatusError as exc:
        logger.error("Ollama returned %s: %s", exc.response.status_code, exc.response.text)
        return f"Engineer radio error ({exc.response.status_code}). Try again."
    except Exception as exc:
        logger.exception("Unexpected Ollama error: %s", exc)
        return "Engineer radio unavailable. Try again."


async def _call_groq(system: str, question: str) -> str:
    """Call Groq cloud API (free tier). Requires GROQ_API_KEY in env."""
    headers = {
        "Authorization": f"Bearer {settings.groq_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": question},
        ],
        "temperature": 0.3,
        "max_tokens": 200,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=headers,
            json=payload,
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()


async def answer_engineer_question(
    context: str,
    question: str,
    session_name: str,
    focused_driver: str | None = None,
) -> str:
    """
    Entry point for race engineer answers.
    Tries Ollama first; if no local model is available, falls back to Groq.
    """
    focused_driver_note = (
        f"The user is specifically asking about driver {focused_driver}. "
        "Prioritise data for that driver."
        if focused_driver
        else ""
    )
    system = ENGINEER_SYSTEM_PROMPT.format(
        session_name=session_name,
        context=context,
        focused_driver_note=focused_driver_note,
    )

    # 1. Try Ollama (local)
    model = await _resolve_model()
    if model is not None:
        try:
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": question},
                ],
                "stream": False,
                "options": {"temperature": 0.3, "num_predict": 200},
            }
            async with httpx.AsyncClient(timeout=60.0) as client:
                r = await client.post(f"{settings.ollama_base_url}/api/chat", json=payload)
                r.raise_for_status()
                logger.info("[AI] Answered via Ollama model=%s", model)
                return r.json()["message"]["content"].strip()
        except Exception as exc:
            logger.warning("[AI] Ollama failed, will try Groq: %s", exc)

    # 2. Fall back to Groq (free cloud)
    if settings.groq_api_key:
        try:
            answer = await _call_groq(system, question)
            logger.info("[AI] Answered via Groq model=%s", settings.groq_model)
            return answer
        except Exception as exc:
            logger.error("[AI] Groq also failed: %s", exc)

    # 3. Nothing available
    return (
        "Engineer radio offline. "
        "For local use: ollama pull llama3.1:8b · "
        "For deployment: set GROQ_API_KEY at console.groq.com (free)"
    )
