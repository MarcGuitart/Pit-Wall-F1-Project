import json
import shutil
from pathlib import Path
from typing import Any

from app.core.config import settings

_ANALYSIS_FILENAME = "_analysis.json"


def _path(session_key: int, endpoint: str) -> Path:
    return settings.cache_path / str(session_key) / f"{endpoint}.json"


def _analysis_path(session_key: int) -> Path:
    return settings.cache_path / str(session_key) / _ANALYSIS_FILENAME


# ── Raw endpoint cache ─────────────────────────────────────────────────────

def get(session_key: int, endpoint: str) -> list[dict] | None:
    p = _path(session_key, endpoint)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def set(session_key: int, endpoint: str, data: list[Any]) -> None:
    p = _path(session_key, endpoint)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


# ── Computed FullRaceAnalysis cache ────────────────────────────────────────

def get_analysis(session_key: int) -> dict | None:
    """Return the cached FullRaceAnalysis dict, or None if not cached."""
    p = _analysis_path(session_key)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def set_analysis(session_key: int, data: dict) -> None:
    """Persist a FullRaceAnalysis dict to disk."""
    p = _analysis_path(session_key)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


# ── Clear ──────────────────────────────────────────────────────────────────

def clear(session_key: int) -> None:
    session_dir = settings.cache_path / str(session_key)
    if session_dir.exists():
        shutil.rmtree(session_dir)
