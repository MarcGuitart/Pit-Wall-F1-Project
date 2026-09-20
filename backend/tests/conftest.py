"""Shared fixtures. Session caches under backend/cache/ are used as real-data fixtures."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

CACHE_DIR = Path(__file__).resolve().parent.parent / "cache"


def load_cached(session_key: int, endpoint: str) -> list[dict]:
    path = CACHE_DIR / str(session_key) / f"{endpoint}.json"
    if not path.exists():
        pytest.skip(f"cache/{session_key}/{endpoint}.json not present")
    return json.loads(path.read_text())


@pytest.fixture
def session_data():
    def _load(session_key: int) -> dict[str, list[dict]]:
        return {
            ep: load_cached(session_key, ep)
            for ep in ("laps", "weather", "race_control", "position", "pit", "stints", "drivers", "intervals")
        }
    return _load


@pytest.fixture(autouse=True)
def _no_real_openf1_credentials(monkeypatch):
    """
    The suite never uses real OpenF1 credentials: whatever the developer's
    .env holds is blanked, the token manager reset, and tests that need an
    account set fake ones explicitly.
    """
    from pydantic import SecretStr

    from app.clients.openf1_auth import token_manager
    from app.core.config import settings

    monkeypatch.setattr(settings, "openf1_username", "")
    monkeypatch.setattr(settings, "openf1_password", SecretStr(""))
    monkeypatch.setattr(settings, "openf1_api_token", "")
    token_manager.clear()
    token_manager.token_requests = 0
    token_manager._lock = asyncio.Lock()
    yield
    token_manager.clear()
