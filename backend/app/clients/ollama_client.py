"""
AI client — tries Ollama (local) first, falls back to Groq (free cloud).

Priority:
  1. Ollama — if running locally with a model pulled
  2. Groq  — if GROQ_API_KEY is set (free tier, no local model needed)
  3. Offline message
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
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
    """
    The configured Ollama model (OLLAMA_MODEL) if Ollama is reachable and has
    it pulled, else None. Never another installed model: whatever else is on
    the machine (phi3:mini, ...) must not answer as the engineer.
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{settings.ollama_base_url}/api/tags")
            r.raise_for_status()
            models = [m["name"] for m in r.json().get("models", [])]
    except Exception:
        return None

    preferred = settings.ollama_model
    if preferred in models:
        return preferred
    if models:
        logger.warning(
            "[AI] Ollama is up but %s is not pulled (has: %s) — skipping local, run: ollama pull %s",
            preferred, ", ".join(models), preferred,
        )
    return None


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
    failure: str | None = None          # why provider == "offline"; see the categories below


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


class LLMRateLimited(Exception):
    """The cloud provider throttled us; not an outage, so no 'offline' fallback."""

    def __init__(self, provider: str, model: str, retry_after_s: int, message: str) -> None:
        super().__init__(message)
        self.provider = provider
        self.model = model
        self.retry_after_s = retry_after_s


# ── Why the engineer is offline ──────────────────────────────────────────────
#
# "Engineer radio offline" used to mean two completely different things: no key
# configured at all, or a configured key whose call failed. In production it was
# the second — a GROQ_MODEL pointing at a decommissioned model — and the message
# sent the reader to console.groq.com to set a key that was already set. Three
# separate incidents in the git history, each diagnosed from scratch.
#
# The category is deliberately coarse and says nothing internal: no status
# codes, no response bodies, no exception text. It tells the reader which knob
# is wrong, not what the provider said.

NOT_CONFIGURED = "not_configured"      # no provider is set up at all
MODEL_UNAVAILABLE = "model_unavailable"  # the provider does not serve this model
AUTH_REJECTED = "auth_rejected"        # the key is wrong, revoked or out of quota
PROVIDER_DOWN = "provider_down"        # unreachable, timed out, or 5xx
CALL_FAILED = "call_failed"            # reached it, got something unusable

_MODEL_GONE_HINTS = ("model_not_found", "does not exist", "decommission",
                     "has been deprecated", "no longer supported", "invalid model")


def classify_groq_failure(exc: BaseException) -> str:
    """Which knob is wrong. Never surfaces anything from the provider verbatim."""
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        body = (exc.response.text or "").lower()
        if status in (401, 403):
            return AUTH_REJECTED
        if status == 404 or (status == 400 and any(h in body for h in _MODEL_GONE_HINTS)):
            return MODEL_UNAVAILABLE
        if status >= 500:
            return PROVIDER_DOWN
        return CALL_FAILED
    if isinstance(exc, (httpx.TimeoutException, httpx.TransportError)):
        return PROVIDER_DOWN
    return CALL_FAILED


OFFLINE_MESSAGE = {
    NOT_CONFIGURED: (
        "Engineer radio offline — no model is configured. "
        "Locally: ollama pull {ollama_model}. "
        "On the server: set GROQ_API_KEY (console.groq.com)."
    ),
    MODEL_UNAVAILABLE: (
        "Engineer radio offline — the configured model is not one the provider "
        "serves any more. GROQ_MODEL is set to {groq_model}; check it against "
        "the provider's current model list. The race analysis itself is fine."
    ),
    AUTH_REJECTED: (
        "Engineer radio offline — the provider refused our credentials. "
        "GROQ_API_KEY is set but not accepted. The race analysis itself is fine."
    ),
    PROVIDER_DOWN: (
        "Engineer radio offline — the model provider did not answer. "
        "Nothing is wrong with the race analysis; try the question again shortly."
    ),
    CALL_FAILED: (
        "Engineer radio offline — the model provider answered with something "
        "unusable. Logged for inspection. The race analysis itself is fine."
    ),
}


def offline_reply(category: str) -> EngineerReply:
    message = OFFLINE_MESSAGE.get(category, OFFLINE_MESSAGE[CALL_FAILED]).format(
        ollama_model=settings.ollama_model, groq_model=settings.groq_model,
    )
    return EngineerReply(message, "offline", None, failure=category)


# ── The provider's model list ────────────────────────────────────────────────
#
# /chat/health used to report groq_available = bool(GROQ_API_KEY), which is true
# for every one of the three model-decommissioned incidents. A health check that
# is green while the thing is down is worse than none, so it now asks the
# provider whether it serves the configured model.

GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models"
MODEL_LIST_TTL_S = 300      # a few minutes: one call per health check would be rude

_model_list: tuple[float, list[str] | None, str | None] | None = None   # (at, ids, failure)
_model_list_lock = asyncio.Lock()


async def groq_model_ids(force: bool = False) -> tuple[list[str] | None, str | None]:
    """
    (model ids, failure category). ids is None when the list could not be read,
    and the category says why. Cached for MODEL_LIST_TTL_S, single-flight, and
    a failure is cached too so a dead provider is not hammered.
    """
    global _model_list
    if not settings.groq_api_key:
        return None, NOT_CONFIGURED

    async with _model_list_lock:
        now = time.monotonic()
        if not force and _model_list is not None and now - _model_list[0] < MODEL_LIST_TTL_S:
            return _model_list[1], _model_list[2]
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    GROQ_MODELS_URL,
                    headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                )
                r.raise_for_status()
                ids = sorted(m["id"] for m in r.json().get("data", []) if m.get("id"))
            _model_list = (now, ids, None)
        except Exception as exc:
            category = classify_groq_failure(exc)
            logger.warning("[AI] could not read the Groq model list (%s)", category)
            _model_list = (now, None, category)
        return _model_list[1], _model_list[2]


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
        "max_tokens": 4000,
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
        if r.status_code == 429:
            retry = r.headers.get("retry-after")
            try:
                retry_s = int(float(retry)) + 1 if retry else 15
            except ValueError:
                retry_s = 15
            logger.warning("[AI] Groq rate limit (%s): %s", settings.groq_model, r.text[:300])
            raise LLMRateLimited("groq", settings.groq_model, retry_s, r.text[:300])
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
    if not settings.groq_api_key:
        logger.warning("[AI] no local model and no GROQ_API_KEY — nothing can answer")
        return offline_reply(NOT_CONFIGURED)

    try:
        text = await _call_groq(system, question)
        logger.info("[AI] Answered via Groq model=%s", settings.groq_model)
        answer, ids, conf = parse_reply(text)
        return EngineerReply(answer, "groq", settings.groq_model, ids, conf)
    except LLMRateLimited:
        raise                       # the caller tells the user to wait, not that we are offline
    except Exception as exc:
        category = classify_groq_failure(exc)
        # The category goes to the user; the detail stays here.
        logger.error("[AI] Groq call failed (%s) model=%s: %s", category, settings.groq_model, exc)
        if category == MODEL_UNAVAILABLE:
            ids, _ = await groq_model_ids(force=True)
            if ids is not None:
                logger.error(
                    "[AI] GROQ_MODEL=%s is not in the provider's list of %d models",
                    settings.groq_model, len(ids),
                )
        return offline_reply(category)


async def active_model() -> tuple[str, str | None]:
    """(provider, model) that /chat would use right now — same order as answer_engineer_question."""
    model = await _resolve_model()
    if model is not None:
        return "ollama", model
    if settings.groq_api_key:
        return "groq", settings.groq_model
    return "offline", None
