"""Shared fixtures. Session caches under backend/cache/ are used as real-data fixtures."""
from __future__ import annotations

import asyncio
import json
import os
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


# ── guard: the suite never modifies backend/cache/ ───────────────────────────
#
# backend/cache/ is versioned and Render bakes it into the image, so a test
# that rewrites a file there ships whatever the test left behind. Every test
# is wrapped: the tree's (size, mtime) is taken before and compared after, and
# the test that changed it fails by name. Tests that compute write to a
# tmp_path copy instead (settings.cache_dir).

def cache_snapshot(root: Path) -> dict[str, tuple[int, int]]:
    out: dict[str, tuple[int, int]] = {}
    for dirpath, _dirs, files in os.walk(root):
        for name in files:
            path = Path(dirpath) / name
            st = path.stat()
            out[str(path.relative_to(root))] = (st.st_size, st.st_mtime_ns)
    return out


def cache_changes(before: dict, after: dict) -> list[str]:
    changed = [f"modified {k}" for k in before.keys() & after.keys() if before[k] != after[k]]
    changed += [f"created {k}" for k in after.keys() - before.keys()]
    changed += [f"deleted {k}" for k in before.keys() - after.keys()]
    return sorted(changed)


@pytest.fixture(autouse=True)
def _backend_cache_untouched():
    before = cache_snapshot(CACHE_DIR)
    yield
    changes = cache_changes(before, cache_snapshot(CACHE_DIR))
    if changes:
        pytest.fail(
            "this test modified the versioned backend/cache/ — point settings.cache_dir "
            "at tmp_path instead: " + ", ".join(changes[:10]),
            pytrace=False,
        )
