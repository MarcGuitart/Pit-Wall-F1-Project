"""Shared fixtures. Session caches under backend/cache/ are used as real-data fixtures."""
from __future__ import annotations

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
