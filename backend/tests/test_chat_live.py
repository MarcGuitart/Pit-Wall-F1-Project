"""POST /chat/live — the live engineer: gated, grounded in the client digest, citations validated."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.clients.ollama_client import EngineerReply
from app.main import app
import app.api.chat as chat_api


def body(**kw):
    return {"session_key": 11730, "question": "Who is fastest?", "context": "P1 VER 1:38.879",
            "signals": [{"id": "RC1", "title": "Yellow in sector 7", "lap_number": 3}], **kw}


def test_live_chat_needs_pro():
    r = TestClient(app).post("/chat/live", json=body())
    assert r.status_code == 402


def test_live_chat_answers_and_keeps_only_real_citations(monkeypatch):
    seen = {}

    async def fake(system, question):
        seen["system"], seen["q"] = system, question
        return EngineerReply("VER leads on 1:38.879.", "groq", "m", ["RC1", "MADE_UP"], "High")

    monkeypatch.setattr(chat_api, "answer_with_system", fake)
    monkeypatch.setattr(chat_api, "require_season_access", lambda *a, **k: None)
    r = TestClient(app).post("/chat/live", json=body(mode="radio", driver="ver"))
    assert r.status_code == 200, r.text
    d = r.json()
    assert [c["id"] for c in d["cited_signals"]] == ["RC1"]
    assert d["confidence"] == "Medium"            # one valid citation caps High
    assert "role-playing VER" in seen["system"] and "[RC1] L3 Yellow in sector 7" in seen["system"]
    assert seen["q"].startswith("Engineer:")


def test_radio_needs_a_driver(monkeypatch):
    monkeypatch.setattr(chat_api, "require_season_access", lambda *a, **k: None)
    r = TestClient(app).post("/chat/live", json=body(mode="radio"))
    assert r.status_code == 400
