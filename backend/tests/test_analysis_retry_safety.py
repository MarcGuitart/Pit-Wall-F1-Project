"""
A retry after the page's 45 s abort does not start a second build — Block 27.

The page aborts /analysis at 45 s and offers Retry. On a cold server the first
build may still be running when the reader presses it. The build is a shared
task per session: the aborted request does not cancel it, and the retry joins
it. Run here on a real build (9539's raw data, copied to a temp cache), slowed
down so the abort lands mid-build.
"""
from __future__ import annotations

import asyncio
import contextlib
import shutil
from pathlib import Path

import httpx
import pytest

from app.api import analysis as analysis_api
from app.clients.openf1_client import RACE_ENDPOINTS
from app.core.config import settings
from app.main import app

REAL_CACHE = Path(__file__).resolve().parents[1] / "cache"


@pytest.fixture
def slow_9539(monkeypatch, tmp_path):
    src = REAL_CACHE / "9539"
    if not src.exists():
        pytest.skip("cache/9539 not present")
    dst = tmp_path / "9539"
    dst.mkdir()
    for name in RACE_ENDPOINTS:
        shutil.copy(src / f"{name}.json", dst / f"{name}.json")
    shutil.copy(src / "_session_meta.json", dst / "_session_meta.json")
    monkeypatch.setattr(settings, "cache_dir", str(tmp_path))

    real_load = analysis_api.load_session
    starts: list[int] = []

    async def counted_slow_load(session_key, *args, **kwargs):
        starts.append(session_key)
        await asyncio.sleep(0.4)  # the cold build: long enough to abort mid-way
        return await real_load(session_key, *args, **kwargs)

    monkeypatch.setattr(analysis_api, "load_session", counted_slow_load)
    return starts, dst


async def _client():
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", timeout=60)


def test_abort_then_retry_runs_one_build(slow_9539):
    starts, dst = slow_9539

    async def scenario():
        async with await _client() as c:
            first = asyncio.create_task(c.get("/analysis/9539"))
            await asyncio.sleep(0.15)          # the build has started
            assert starts == [9539]
            first.cancel()                     # the page gives up (its 45 s abort)
            with contextlib.suppress(asyncio.CancelledError):
                await first
            retry = await c.get("/analysis/9539")
            return retry

    r = asyncio.run(scenario())
    assert r.status_code == 200
    assert r.json()["race"]["session_key"] == 9539
    assert starts == [9539], "the retry must join the build, not start another"
    assert (dst / "_analysis.json").exists()
    assert analysis_api._builds == {}          # forgotten once done


def test_two_readers_at_once_share_one_build(slow_9539):
    starts, _ = slow_9539

    async def scenario():
        async with await _client() as c:
            return await asyncio.gather(c.get("/analysis/9539"), c.get("/analysis/9539"))

    a, b = asyncio.run(scenario())
    assert a.status_code == b.status_code == 200
    assert a.json()["race"] == b.json()["race"]
    assert starts == [9539]


def test_a_failed_build_is_not_reused(slow_9539, monkeypatch):
    """A build that failed is forgotten: the next request starts a fresh one."""
    starts, _ = slow_9539
    calls = {"n": 0}
    real = analysis_api.build_race_timeline

    def flaky(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("boom")
        return real(*args, **kwargs)

    monkeypatch.setattr(analysis_api, "build_race_timeline", flaky)

    async def scenario():
        async with await _client() as c:
            return await c.get("/analysis/9539"), await c.get("/analysis/9539")

    first, second = asyncio.run(scenario())
    assert first.status_code == 500 and first.json()["error"]["code"] == "ANALYSIS_FAILED"
    assert second.status_code == 200
    assert len(starts) == 2
