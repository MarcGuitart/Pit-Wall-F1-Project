import json
import logging
import shutil
from pathlib import Path
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

_ANALYSIS_FILENAME = "_analysis.json"
_SESSION_META_FILENAME = "_session_meta.json"
_TELEMETRY_FILENAME = "telemetry.json"


def _path(session_key: int, endpoint: str) -> Path:
    return settings.cache_path / str(session_key) / f"{endpoint}.json"


def _analysis_path(session_key: int) -> Path:
    return settings.cache_path / str(session_key) / _ANALYSIS_FILENAME


def _session_meta_path(session_key: int) -> Path:
    return settings.cache_path / str(session_key) / _SESSION_META_FILENAME


# ── Raw endpoint cache ─────────────────────────────────────────────────────

def get(session_key: int, endpoint: str) -> list[dict] | None:
    p = _path(session_key, endpoint)
    if not p.exists():
        logger.info("[CACHE MISS] %s for %s", endpoint, session_key)
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        logger.info("[CACHE HIT] %s for %s", endpoint, session_key)
        return data
    except (json.JSONDecodeError, OSError):
        logger.warning("[CACHE CORRUPT] %s for %s — deleting", endpoint, session_key)
        try:
            p.unlink()
        except OSError:
            pass
        return None


def set(session_key: int, endpoint: str, data: list[Any]) -> None:
    p = _path(session_key, endpoint)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    logger.info("[CACHE SAVED] %s for %s", endpoint, session_key)


# ── Computed FullRaceAnalysis cache ────────────────────────────────────────

def get_full_analysis(session_key: int) -> dict | None:
    """Return the cached FullRaceAnalysis dict, or None if not cached."""
    p = _analysis_path(session_key)
    if not p.exists():
        logger.info("[CACHE MISS] _analysis.json for %s", session_key)
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        logger.info("[CACHE HIT] _analysis.json for %s (full analysis)", session_key)
        return data
    except (json.JSONDecodeError, OSError):
        logger.warning("[CACHE CORRUPT] _analysis.json for %s — deleting", session_key)
        try:
            p.unlink()
        except OSError:
            pass
        return None


def set_full_analysis(session_key: int, data: dict) -> None:
    """Persist a FullRaceAnalysis dict to disk."""
    p = _analysis_path(session_key)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, default=str), encoding="utf-8")
    logger.info("[CACHE SAVED] _analysis.json for %s", session_key)


# ── Circuit telemetry cache (FastF1) ───────────────────────────────────────

def _telemetry_path(session_key: int) -> Path:
    return settings.cache_path / str(session_key) / _TELEMETRY_FILENAME


def get_telemetry(session_key: int) -> dict | None:
    """Return cached telemetry dict, or None if not cached."""
    p = _telemetry_path(session_key)
    if not p.exists():
        logger.info("[CACHE MISS] telemetry for %s", session_key)
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        logger.info("[CACHE HIT] telemetry for %s", session_key)
        return data
    except (json.JSONDecodeError, OSError):
        logger.warning("[CACHE CORRUPT] telemetry for %s — deleting", session_key)
        try:
            p.unlink()
        except OSError:
            pass
        return None


def set_telemetry(session_key: int, data: dict) -> None:
    """Persist telemetry dict to disk."""
    p = _telemetry_path(session_key)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, default=str), encoding="utf-8")
    logger.info("[CACHE SAVED] telemetry for %s", session_key)


# ── Backward-compat aliases ────────────────────────────────────────────────

def get_analysis(session_key: int) -> dict | None:
    return get_full_analysis(session_key)


def set_analysis(session_key: int, data: dict) -> None:
    set_full_analysis(session_key, data)


# ── Session metadata cache ─────────────────────────────────────────────────

def get_session_meta(session_key: int) -> dict | None:
    p = _session_meta_path(session_key)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        try:
            p.unlink()
        except OSError:
            pass
        return None


def set_session_meta(session_key: int, data: dict) -> None:
    p = _session_meta_path(session_key)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, default=str), encoding="utf-8")


# ── Meetings list cache (immutable for past years) ────────────────────────

def get_meetings(year: int) -> list | None:
    p = settings.cache_path / f"meetings_{year}.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        try:
            p.unlink()
        except OSError:
            pass
        return None


def set_meetings(year: int, data: list) -> None:
    p = settings.cache_path / f"meetings_{year}.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, default=str), encoding="utf-8")
    logger.info("[CACHE SAVED] meetings_%s.json (%d meetings)", year, len(data))


# ── Sessions-per-meeting cache ─────────────────────────────────────────────

def get_sessions_for_meeting(meeting_key: int) -> list | None:
    p = settings.cache_path / f"meeting_{meeting_key}_sessions.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        try:
            p.unlink()
        except OSError:
            pass
        return None


def set_sessions_for_meeting(meeting_key: int, data: list) -> None:
    p = settings.cache_path / f"meeting_{meeting_key}_sessions.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, default=str), encoding="utf-8")
    logger.info("[CACHE SAVED] meeting_%s_sessions.json (%d sessions)", meeting_key, len(data))


# ── Clear ──────────────────────────────────────────────────────────────────

def clear(session_key: int) -> None:
    session_dir = settings.cache_path / str(session_key)
    if session_dir.exists():
        shutil.rmtree(session_dir)
