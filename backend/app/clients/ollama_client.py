"""
AI client — tries Ollama (local) first, falls back to Groq (free cloud).

Priority:
  1. Ollama — if running locally with a model pulled
  2. Groq  — if GROQ_API_KEY is set (free tier, no local model needed)
  3. Offline message
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

ENGINEER_SYSTEM_PROMPT = """You are a race engineer analysing the {session_name} session.
The computed analysis below is your primary data source. Use it to give specific, grounded answers.

Rules:
- Always try to answer. Use the analysis data directly — cite lap numbers, driver codes, times.
- If a number or fact is present in the analysis, use it. If it is genuinely absent, say briefly what you have and what you don't, then give your best engineering judgement.
- Do NOT refuse with "insufficient analysis" when the relevant data IS in the context.
- You may cite and compare metrics freely, but never connect two metrics with causal words ("due to", "because", "caused by", "resulted in", "explains why") unless the analysis text explicitly states that link. To point at a possible connection, use hedged phrasing only ("could be related to...", "possibly linked to..."). Correct: "VER's median is 0.33s lower than NOR's — this could be related to a smaller traffic delta." Wrong: "VER's median is lower due to a smaller traffic delta."
- Never explain a specific lap event (a safety car, a pit stop, a tyre cliff) using the race's general conditions (e.g. "a weather-affected race", "an extreme chaos race") unless that exact event's own entry in the analysis names that cause. A race labelled weather-affected can still have a safety car caused by a collision, not rain — check the specific event, don't infer from the race-level label.
- `true_pace_rank`, `starting_grid_position` and `actual_race_finish_position` are three different things — never use one to mean another. True Pace strips out pit stops, safety cars and traffic; the grid slot is where they started; the finish position is where they ended. A driver can be true_pace_rank 1, start P17 and finish P1. Never say a driver "won" or "finished" a position based on true_pace_rank alone, and never infer a grid slot from the finish order — when starting_grid_position is present, use it; it is real data, not an estimate.
- 2-4 sentences maximum. Direct, pit wall tone.
- Cite laps and signals when available (e.g. "Lap 45 — VER pitted, net +2 positions").
- No markdown, no bullet points.

Reply as a single JSON object with exactly these keys:
- "answer": the reply text.
- "cited_signal_ids": the "id" values from `signals` whose content you actually used in the answer. Only ids that exist there. An empty list if you used none.
- "confidence": "Low", "Medium" or "High" — how well the analysis data supports the answer.

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
            "num_predict": 400,
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


REPLY_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "cited_signal_ids": {"type": "array", "items": {"type": "string"}},
        "confidence": {"type": "string", "enum": ["Low", "Medium", "High"]},
    },
    "required": ["answer", "cited_signal_ids", "confidence"],
    "additionalProperties": False,
}


@dataclass
class EngineerReply:
    answer: str
    provider: str                       # "ollama" | "groq" | "offline"
    model: str | None                   # model that actually answered
    cited_signal_ids: list[str] = field(default_factory=list)   # as declared by the model, unvalidated
    confidence: str | None = None       # as declared by the model; None if it sent no structured block


def parse_reply(text: str) -> tuple[str, list[str], str | None]:
    """
    (answer, cited_signal_ids, confidence) from the model output.
    Accepts the JSON object, optionally inside a ``` fence. Anything else is
    treated as a plain-text answer with no citations and no confidence.
    """
    raw = text.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:]
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return text.strip(), [], None
    if not isinstance(data, dict) or not isinstance(data.get("answer"), str):
        return text.strip(), [], None
    ids = data.get("cited_signal_ids")
    ids = [i for i in ids if isinstance(i, str)] if isinstance(ids, list) else []
    conf = data.get("confidence")
    conf = conf if conf in ("Low", "Medium", "High") else None
    return data["answer"].strip(), ids, conf


def _groq_supports_reasoning_effort(model: str) -> bool:
    return model.startswith("openai/gpt-oss")


async def _call_groq(system: str, question: str) -> str:
    """Call Groq cloud API. Requires GROQ_API_KEY in env."""
    headers = {
        "Authorization": f"Bearer {settings.groq_api_key}",
        "Content-Type": "application/json",
    }
    payload: dict = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": question},
        ],
        "temperature": 0.3,
        "max_tokens": 600,
    }
    if _groq_supports_reasoning_effort(settings.groq_model):
        payload["reasoning_effort"] = settings.groq_reasoning_effort
    payload["response_format"] = {
        "type": "json_schema",
        "json_schema": {"name": "engineer_reply", "strict": True, "schema": REPLY_SCHEMA},
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=headers,
            json=payload,
        )
        if r.status_code == 400 and "response_format" in r.text:
            # Model without structured-output support: ask for plain JSON instead
            logger.warning("[AI] Groq rejected json_schema for %s — retrying with json_object", settings.groq_model)
            payload["response_format"] = {"type": "json_object"}
            r = await client.post(
                "https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload,
            )
        if not r.is_success:
            logger.error("[AI] Groq HTTP %s — body: %s", r.status_code, r.text)
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()


async def answer_engineer_question(
    context: str,
    question: str,
    session_name: str,
    focused_driver: str | None = None,
) -> EngineerReply:
    """
    Entry point for race engineer answers.
    Tries Ollama first; if no local model is available, falls back to Groq.
    The reply says which provider/model actually answered.
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
                "format": REPLY_SCHEMA,      # Ollama structured output (>= 0.5)
                "options": {"temperature": 0.3, "num_predict": 600},
            }
            async with httpx.AsyncClient(timeout=60.0) as client:
                r = await client.post(f"{settings.ollama_base_url}/api/chat", json=payload)
                r.raise_for_status()
                logger.info("[AI] Answered via Ollama model=%s", model)
                answer, ids, conf = parse_reply(r.json()["message"]["content"])
                return EngineerReply(answer, "ollama", model, ids, conf)
        except Exception as exc:
            logger.warning("[AI] Ollama failed, will try Groq: %s", exc)

    # 2. Fall back to Groq (cloud)
    if settings.groq_api_key:
        try:
            text = await _call_groq(system, question)
            logger.info("[AI] Answered via Groq model=%s", settings.groq_model)
            answer, ids, conf = parse_reply(text)
            return EngineerReply(answer, "groq", settings.groq_model, ids, conf)
        except Exception as exc:
            logger.error("[AI] Groq also failed: %s", exc)

    # 3. Nothing available
    return EngineerReply(
        "Engineer radio offline. "
        f"For local use: ollama pull {settings.ollama_model} · "
        "For deployment: set GROQ_API_KEY at console.groq.com",
        "offline",
        None,
    )


async def active_model() -> tuple[str, str | None]:
    """(provider, model) that /chat would use right now — same order as answer_engineer_question."""
    model = await _resolve_model()
    if model is not None:
        return "ollama", model
    if settings.groq_api_key:
        return "groq", settings.groq_model
    return "offline", None
