"""Ollama local AI client — OpenAI-compatible /api/chat endpoint."""
from __future__ import annotations

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

ENGINEER_SYSTEM_PROMPT = """You are the race engineer for {session_name}.
You have access to the race data below. Answer questions like a pit wall engineer: \
direct, technical, cite specific laps and data signals.
Keep answers to 2-4 sentences. Never invent data not present in the context.
If the context doesn't contain the answer, say so directly.
Do not use markdown formatting in your response.

Race data:
{context}"""


async def call_ollama(
    context: str,
    question: str,
    session_name: str,
) -> str:
    """
    Send a question to Ollama with the compact race context injected into
    the system prompt.  Returns the model's answer as plain text.
    """
    system = ENGINEER_SYSTEM_PROMPT.format(
        session_name=session_name,
        context=context,
    )

    payload = {
        "model": settings.ollama_model,
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
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(f"{settings.ollama_url}/api/chat", json=payload)
            r.raise_for_status()
            data = r.json()
            return data["message"]["content"].strip()
    except httpx.ConnectError:
        logger.warning("Ollama not reachable at %s", settings.ollama_url)
        return (
            "Engineer radio unavailable. "
            "Check that Ollama is running: `ollama serve`"
        )
    except httpx.HTTPStatusError as exc:
        logger.error("Ollama returned %s: %s", exc.response.status_code, exc.response.text)
        return "Engineer radio error. Check Ollama model is pulled: `ollama pull llama3.1:8b`"
    except Exception as exc:
        logger.exception("Unexpected Ollama error: %s", exc)
        return "Engineer radio unavailable. Try again."
