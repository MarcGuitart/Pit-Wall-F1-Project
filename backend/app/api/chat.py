"""
POST /chat  — AI-backed race engineer chat.
GET  /chat/health — Connectivity check (Ollama + Groq).

AI priority: Ollama (local) → Groq (free cloud) → offline message.
The /analysis/{session_key} endpoint must have been called first.
"""
from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.core import cache
from app.core.config import settings
from app.core.errors import AppError
from app.core.ratelimit import SlidingWindow
from app.domain.models import FullRaceAnalysis
from app.services.chat_service import build_chat_context, signal_catalog
from app.clients.ollama_client import active_model, answer_engineer_question

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
    # The model's own declaration; None when it returned no structured block.
    confidence: str | None = None
    provider: str
    model: str | None = None


@router.get("/chat/health")
async def chat_health() -> dict:
    """Check Ollama and Groq availability."""
    groq_available = bool(settings.groq_api_key)
    provider, model = await active_model()
    active = {
        "active_provider": provider,
        "active_model": model,
        "groq_model": settings.groq_model,
        "groq_reasoning_effort": settings.groq_reasoning_effort,
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{settings.ollama_base_url}/api/tags")
            r.raise_for_status()
            tags = r.json()
            models = [m["name"] for m in tags.get("models", [])]
            model_available = any(settings.ollama_model in m for m in models)
            ai_ready = model_available or groq_available
            return {
                "ollama_reachable": True,
                "base_url": settings.ollama_base_url,
                "model": settings.ollama_model,
                "model_available": model_available,
                "available_models": models,
                "groq_available": groq_available,
                "ai_ready": ai_ready,
                **active,
            }
    except Exception as exc:
        return {
            "ollama_reachable": False,
            "base_url": settings.ollama_base_url,
            "model": settings.ollama_model,
            "error": str(exc),
            "groq_available": groq_available,
            "ai_ready": groq_available,
            **active,
        }


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, request: Request) -> ChatResponse:
    # 0. Rate limit before anything that costs LLM quota
    enforce_chat_rate_limit(request)

    # 1. Load analysis from cache (must have been computed via /analysis first)
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

    # 2. Build compact context string
    context = build_chat_context(analysis, req.focused_driver)

    # 3. Call AI (Ollama → Groq fallback)
    session_name = f"{analysis.race.meeting_name} {analysis.race.year}"
    reply = await answer_engineer_question(
        context, req.question.strip(), session_name, req.focused_driver
    )

    # 4. Cited signals: only ids the model declared AND that exist in the catalogue
    catalog = signal_catalog(analysis)
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
        confidence=reply.confidence,
        provider=reply.provider,
        model=reply.model,
    )
