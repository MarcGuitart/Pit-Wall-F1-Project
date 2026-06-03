"""
POST /chat — Ollama-backed race engineer chat.

The /analysis/{session_key} endpoint must have been called first so that
the FullRaceAnalysis is persisted in the local cache.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core import cache
from app.domain.models import FullRaceAnalysis
from app.services.chat_service import build_chat_context
from app.clients.ollama_client import call_ollama

router = APIRouter(tags=["chat"])
logger = logging.getLogger(__name__)


class ChatRequest(BaseModel):
    session_key: int
    question: str
    focused_driver: str | None = None


class ChatResponse(BaseModel):
    answer: str
    cited_signals: list[str] = []
    confidence: str = "Medium"


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    # 1. Load analysis from cache (must have been computed via /analysis first)
    raw = cache.get_analysis(req.session_key)
    if raw is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No analysis cached for session {req.session_key}. "
                f"Call GET /analysis/{req.session_key} first."
            ),
        )

    try:
        analysis = FullRaceAnalysis.model_validate(raw)
    except Exception as exc:
        logger.error("Failed to deserialise cached analysis: %s", exc)
        raise HTTPException(status_code=500, detail="Cached analysis is corrupted.") from exc

    # 2. Build compact context string
    context = build_chat_context(analysis, req.focused_driver)

    # 3. Call Ollama
    session_name = f"{analysis.race.meeting_name} {analysis.race.year}"
    answer = await call_ollama(context, req.question.strip(), session_name)

    # 4. Simple cited-signals: list note titles from context
    cited = [n.title for n in analysis.engineer_notes[:3]]

    return ChatResponse(answer=answer, cited_signals=cited)
