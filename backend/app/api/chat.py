"""
POST /chat  — AI-backed race engineer chat.
GET  /chat/health — Connectivity check (Ollama + Groq), including whether the
                   provider actually serves the configured model.

AI priority: Ollama (local) → Groq (free cloud) → offline message.
The /analysis/{session_key} endpoint must have been called first.
"""
from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.core import cache
from app.core.access import require_season_access
from app.core.config import settings
from app.core.errors import AppError
from app.core.ratelimit import SlidingWindow
from app.domain.models import FullRaceAnalysis
from app.services.chat_service import build_chat_context, select_signals
from app.clients.ollama_client import (
    MODEL_LIST_TTL_S,
    NOT_CONFIGURED,
    LLMRateLimited,
    active_model,
    answer_engineer_question,
    answer_with_system,
    groq_model_ids,
)

router = APIRouter(tags=["chat"])
logger = logging.getLogger(__name__)


CLIENT_ID_HEADER = "X-Client-Id"

_session_limiter = SlidingWindow(settings.chat_rate_limit_per_session, settings.chat_rate_limit_window_s)
_ip_limiter = SlidingWindow(settings.chat_rate_limit_per_ip, settings.chat_rate_limit_window_s)


def _client_ip(request: Request) -> str:
    # Render terminates TLS in front of us; the first X-Forwarded-For entry is the caller.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def enforce_chat_rate_limit(request: Request) -> None:
    """
    Sliding-window limit per browser session (X-Client-Id) with a higher
    per-IP cap behind it. Raises RATE_LIMITED (429) with the seconds to wait.
    Both counters are only hit when the request is allowed.
    """
    ip = _client_ip(request)
    client_id = request.headers.get(CLIENT_ID_HEADER, "").strip() or f"ip:{ip}"

    checks = (
        ("session", _session_limiter, client_id),
        ("ip", _ip_limiter, ip),
    )
    for scope, limiter, key in checks:
        wait = limiter.retry_after(key)
        if wait > 0:
            retry_after = int(wait) + 1
            raise AppError(
                "RATE_LIMITED",
                f"Message limit reached ({limiter.limit} per {limiter.window // 60:.0f} min"
                f"{' for this browser session' if scope == 'session' else ' for this network'}). "
                f"Try again in {retry_after} s.",
                status=429,
                details={
                    "retry_after_seconds": retry_after,
                    "scope": scope,
                    "limit": limiter.limit,
                    "window_seconds": int(limiter.window),
                },
            )
    for _, limiter, key in checks:
        limiter.hit(key)


_CONF_RANK = {"Low": 0, "Medium": 1, "High": 2}


def structural_confidence(declared: str | None, valid_citations: int) -> str | None:
    """
    Cap the model's declared confidence by the evidence it actually cited:
    0 validated signals -> at most Low, 1 -> at most Medium, 2+ -> as declared.
    An answer that cites nothing did not read the data, whatever it says.
    """
    if declared is None:
        return None
    cap = "Low" if valid_citations == 0 else "Medium" if valid_citations == 1 else "High"
    return declared if _CONF_RANK[declared] <= _CONF_RANK[cap] else cap


class ChatRequest(BaseModel):
    session_key: int
    question: str
    focused_driver: str | None = None


class CitedSignal(BaseModel):
    id: str
    lap_number: int | None = None
    title: str


class ChatResponse(BaseModel):
    answer: str
    # Engineer notes the model declared it used, validated against the catalogue
    # it was given. Empty when it cited none (or none that exist) — never guessed.
    cited_signals: list[CitedSignal] = []
    # Structural confidence: the model's own declaration capped by how many
    # validated signals back the answer (see structural_confidence). None only
    # when the model returned no structured block at all.
    confidence: str | None = None
    declared_confidence: str | None = None
    provider: str
    model: str | None = None


async def _groq_health() -> dict:
    """
    Whether Groq could actually answer a question right now.

    A key being present is not availability. Every one of the three
    model-decommissioned incidents in this project's history had a valid key and
    a green health check, so the check asks the provider for its model list and
    looks for the configured model in it. The list is cached for a few minutes
    (MODEL_LIST_TTL_S) so polling this endpoint does not hammer the provider.
    """
    if not settings.groq_api_key:
        return {
            "groq_configured": False,
            "groq_available": False,
            "groq_model": settings.groq_model,
            "groq_model_available": None,
            "groq_reason": NOT_CONFIGURED,
        }

    ids, failure = await groq_model_ids()
    if ids is None:
        # Could not read the list. That is not proof the model is gone, so the
        # verdict is "unknown", not "available" — a green light we cannot
        # justify is the exact failure this check exists to stop.
        return {
            "groq_configured": True,
            "groq_available": False,
            "groq_model": settings.groq_model,
            "groq_model_available": None,
            "groq_reason": failure,
            "groq_model_list_cached_for_s": MODEL_LIST_TTL_S,
        }

    present = settings.groq_model in ids
    return {
        "groq_configured": True,
        "groq_available": present,
        "groq_model": settings.groq_model,
        "groq_model_available": present,
        "groq_reason": None if present else "model_unavailable",
        "groq_models_served": len(ids),
        # Only on failure, and only the ids — they are public product names.
        **({} if present else {"groq_available_models": ids}),
        "groq_model_list_cached_for_s": MODEL_LIST_TTL_S,
    }


@router.get("/chat/health")
async def chat_health() -> dict:
    """Can /chat answer right now, and if not, which side is at fault."""
    groq = await _groq_health()
    provider, model = await active_model()
    ollama: dict = {
        "ollama_reachable": False,
        "base_url": settings.ollama_base_url,
        "model": settings.ollama_model,
        "model_available": False,
        "available_models": [],
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{settings.ollama_base_url}/api/tags")
            r.raise_for_status()
            models = [m["name"] for m in r.json().get("models", [])]
        ollama.update(
            ollama_reachable=True,
            available_models=models,
            model_available=any(settings.ollama_model in m for m in models),
        )
    except Exception as exc:
        # Expected on the server, where there is no Ollama at all.
        ollama["ollama_error"] = type(exc).__name__

    return {
        **ollama,
        **groq,
        "ai_ready": ollama["model_available"] or groq["groq_available"],
        "active_provider": provider,
        "active_model": model,
        "groq_reasoning_effort": settings.groq_reasoning_effort,
    }


def _chat_year(session_key: int) -> int | None:
    """The season, from the local metadata. Unknown is PRO, never free."""
    meta = cache.get_session_meta(session_key)
    if isinstance(meta, dict) and isinstance(meta.get("year"), int):
        return meta["year"]
    analysis = cache.get_full_analysis(session_key)
    if isinstance(analysis, dict):
        year = (analysis.get("race") or {}).get("year")
        if isinstance(year, int):
            return year
    return None


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, request: Request) -> ChatResponse:
    # 0. Rate limit before anything that costs LLM quota
    enforce_chat_rate_limit(request)

    # 1. PRO gate. /chat reads the analysis straight from disk, so without this
    #    a PRO race that had been computed once would be readable, in prose,
    #    by anyone who knew its session_key — a back door around /analysis.
    require_season_access(request, _chat_year(req.session_key), req.session_key)

    # 2. Load analysis from cache (must have been computed via /analysis first)
    raw = cache.get_analysis(req.session_key)
    if raw is None:
        raise AppError(
            "ANALYSIS_NOT_FOUND",
            f"No analysis cached for session {req.session_key}. "
            f"Open the race analysis first, then ask the engineer.",
            status=404,
        )

    try:
        analysis = FullRaceAnalysis.model_validate(raw)
    except Exception as exc:
        logger.error("Failed to deserialise cached analysis: %s", exc)
        raise AppError(
            "ANALYSIS_FAILED",
            "The cached analysis for this session no longer matches the current "
            "schema. Reload the race analysis to regenerate it.",
            status=500,
        ) from exc

    # 3. Build compact context string
    context = build_chat_context(analysis, req.focused_driver, question=req.question)

    # 4. Call AI (Ollama → Groq fallback)
    session_name = f"{analysis.race.meeting_name} {analysis.race.year}"
    try:
        reply = await answer_engineer_question(
            context, req.question.strip(), session_name, req.focused_driver
        )
    except LLMRateLimited as exc:
        raise AppError(
            "LLM_RATE_LIMITED",
            f"The engineer's model ({exc.model}) is at its provider rate limit. "
            f"Try again in {exc.retry_after_s} s.",
            status=503,
            details={"provider": exc.provider, "model": exc.model, "retry_after_seconds": exc.retry_after_s},
        ) from exc

    # 5. Cited signals: only ids the model declared AND that were in the subset it was sent
    catalog = select_signals(analysis, req.question, req.focused_driver)
    seen: set[str] = set()
    cited: list[CitedSignal] = []
    for sid in reply.cited_signal_ids:
        note = catalog.get(sid)
        if note is None or sid in seen:
            continue
        seen.add(sid)
        cited.append(CitedSignal(id=sid, lap_number=note.lap_number, title=note.title))
    if len(cited) != len(reply.cited_signal_ids):
        logger.info(
            "[CHAT] model cited %d id(s), %d valid", len(reply.cited_signal_ids), len(cited)
        )

    return ChatResponse(
        answer=reply.answer,
        cited_signals=cited,
        confidence=structural_confidence(reply.confidence, len(cited)),
        declared_confidence=reply.confidence,
        provider=reply.provider,
        model=reply.model,
    )


# ── live engineer ──────────────────────────────────────────────────────────
#
# The live page has no published analysis to read: the session is still
# running and its state lives in the live server, not here. So the browser
# sends the digest it is already showing — built from the SSE snapshot by
# frontend/lib/liveContext.ts — and the model answers from that alone. A
# client could send anything as context; the only person that misleads is
# the client, and the size cap keeps it from costing more than a question.

LIVE_CONTEXT_MAX = 14_000

LIVE_ENGINEER_PROMPT = """You are a race engineer on the pit wall during the live {session} session.
The live timing digest below is everything known right now. The session is still running: nothing in it is final.

Rules:
- Answer from the digest only. Cite driver codes, lap numbers, times and gaps exactly as given.
- If something is not in the digest, say so in one short clause, then give your best read of what is there.
- Never predict a result, a stop lap or a winner as fact. You may describe what the data suggests, hedged ("on current pace...", "if this holds...").
- Never connect two numbers with causal words ("because", "due to") unless the digest states the cause.
- 2-4 sentences. Direct, pit wall tone. No markdown, no bullet points.

Reply as a single JSON object with exactly these keys:
- "answer": the reply text.
- "cited_signal_ids": the ids from the SIGNALS section you actually used. Empty list if none.
- "confidence": "Low", "Medium" or "High" — how well the digest supports the answer.

{focus}

Live digest:
{context}"""

LIVE_RADIO_PROMPT = """You are role-playing {driver}, driving in the live {session} session, answering your race engineer over team radio.
This is a clearly-labelled simulation for a fan application: you are not the real driver and must never claim to be.

Rules:
- Stay in character: short, breathless radio replies, 1-3 sentences, first person.
- Ground every factual claim in the live digest below — your position, gaps, tyre, tyre age, lap times, pit stops. Use the numbers as given.
- Never invent incidents, car problems, team orders or feelings about real people. If the engineer asks about something not in the digest, answer as a driver who cannot see that from the cockpit.
- No profanity, no markdown.

Reply as a single JSON object with exactly these keys:
- "answer": the radio reply.
- "cited_signal_ids": ids from the SIGNALS section you used. Empty list if none.
- "confidence": "Low", "Medium" or "High" — how well the digest supports what you said.

Live digest:
{context}"""


class LiveSignal(BaseModel):
    id: str
    title: str
    lap_number: int | None = None


class LiveChatRequest(BaseModel):
    session_key: int
    question: str
    mode: str = "engineer"            # "engineer" | "radio"
    driver: str | None = None         # the focused driver, or the one on the radio
    session_name: str | None = None
    context: str
    signals: list[LiveSignal] = []


@router.post("/chat/live", response_model=ChatResponse)
async def chat_live(req: LiveChatRequest, request: Request) -> ChatResponse:
    enforce_chat_rate_limit(request)
    # Live is PRO whatever the season: there is no free live mode.
    from datetime import datetime, timezone
    require_season_access(request, datetime.now(timezone.utc).year, req.session_key)

    question = req.question.strip()[:500]
    if not question:
        raise AppError("EMPTY_QUESTION", "Ask the engineer something.", status=400)
    if req.mode == "radio" and not req.driver:
        raise AppError("DRIVER_REQUIRED", "Pick a driver to talk to on the radio.", status=400)

    signals = {s.id: s for s in req.signals[:80]}
    context = req.context[:LIVE_CONTEXT_MAX]
    if signals:
        context += "\n\nSIGNALS\n" + "\n".join(
            f"[{s.id}]{f' L{s.lap_number}' if s.lap_number else ''} {s.title}" for s in signals.values())
    session = (req.session_name or f"session {req.session_key}")[:80]
    driver = (req.driver or "")[:4].upper()
    if req.mode == "radio":
        system = LIVE_RADIO_PROMPT.format(driver=driver, session=session, context=context)
        prompt_q = f"Engineer: {question}"
    else:
        focus = f"The user is following {driver}. Prioritise that driver." if driver else ""
        system = LIVE_ENGINEER_PROMPT.format(session=session, context=context, focus=focus)
        prompt_q = question

    try:
        reply = await answer_with_system(system, prompt_q)
    except LLMRateLimited as exc:
        raise AppError(
            "LLM_RATE_LIMITED",
            f"The engineer's model ({exc.model}) is at its provider rate limit. Try again in {exc.retry_after_s} s.",
            status=503,
            details={"provider": exc.provider, "model": exc.model, "retry_after_seconds": exc.retry_after_s},
        ) from exc

    seen: set[str] = set()
    cited: list[CitedSignal] = []
    for sid in reply.cited_signal_ids:
        sig = signals.get(sid)
        if sig is None or sid in seen:
            continue
        seen.add(sid)
        cited.append(CitedSignal(id=sid, lap_number=sig.lap_number, title=sig.title))
    return ChatResponse(
        answer=reply.answer,
        cited_signals=cited,
        confidence=structural_confidence(reply.confidence, len(cited)),
        declared_confidence=reply.confidence,
        provider=reply.provider,
        model=reply.model,
    )
