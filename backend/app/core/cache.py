import json
import shutil
from pathlib import Path
from typing import Any

from app.core.config import settings


def _path(session_key: int, endpoint: str) -> Path:
    return settings.cache_path / str(session_key) / f"{endpoint}.json"


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


def clear(session_key: int) -> None:
    session_dir = settings.cache_path / str(session_key)
    if session_dir.exists():
        shutil.rmtree(session_dir)
