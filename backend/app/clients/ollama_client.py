"""Ollama local AI client — OpenAI-compatible /api/chat endpoint."""
from __future__ import annotations

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

ENGINEER_SYSTEM_PROMPT = """You are a race engineer analysing the {session_name} session.
You have access only to the computed analysis below — do not invent any data.
If the analysis does not contain enough information to answer, say exactly:
"The available OpenF1-derived analysis is insufficient to answer this."

Answer style:
- Direct, technical, pit wall tone
- 2-4 sentences maximum
- Cite specific laps and signals when available
- Include confidence: Low / Medium / High at the end as "Confidence: X"
- Do not use markdown formatting
- Do not use bullet points

{focused_driver_note}

Computed analysis:
{context}"""


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
            r = await client.post(
                f"{settings.ollama_base_url}/api/chat", json=payload
            )
            r.raise_for_status()
            data = r.json()
            return data["message"]["content"].strip()
    except httpx.ConnectError:
        logger.warning(
            "Ollama not reachable at %s. Run: ollama serve && ollama pull %s",
            settings.ollama_base_url,
            settings.ollama_model,
        )
        return (
            "Engineer radio unavailable. "
            f"Check that Ollama is running: ollama serve && ollama pull {settings.ollama_model}"
        )
    except httpx.HTTPStatusError as exc:
        logger.error(
            "Ollama returned %s: %s", exc.response.status_code, exc.response.text
        )
        return (
            f"Engineer radio error. Check Ollama model is pulled: "
            f"ollama pull {settings.ollama_model}"
        )
    except Exception as exc:
        logger.exception("Unexpected Ollama error: %s", exc)
        return "Engineer radio unavailable. Try again."
