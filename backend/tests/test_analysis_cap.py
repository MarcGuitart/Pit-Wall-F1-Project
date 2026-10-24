"""The global cap on cold /analysis builds: two at once, a third gets 429 ANALYSIS_BUSY."""
from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from app.api import analysis
from app.core.errors import AppError
from app.main import app


@pytest.fixture(autouse=True)
def clean_builds():
    analysis._builds.clear()
    yield
    analysis._builds.clear()


def test_a_third_cold_build_is_refused_with_a_countdown(monkeypatch):
    async def scenario():
        gate = asyncio.Event()

        async def slow_build(key, meta, force):
            await gate.wait()
            return f"analysis {key}"

        monkeypatch.setattr(analysis, "_build", slow_build)
        a = asyncio.ensure_future(analysis._shared_build(1, {}, False))
        b = asyncio.ensure_future(analysis._shared_build(2, {}, False))
        await asyncio.sleep(0)
        with pytest.raises(AppError) as exc:
            await analysis._shared_build(3, {}, False)
        assert exc.value.code == "ANALYSIS_BUSY" and exc.value.status == 429
        assert exc.value.details["retry_after_seconds"] == analysis.BUSY_RETRY_S
        # Joining a build already running is never refused.
        joined = asyncio.ensure_future(analysis._shared_build(1, {}, False))
        gate.set()
        assert await a == "analysis 1" and await joined == "analysis 1" and await b == "analysis 2"
        # Once they finish, a new one starts.
        assert await analysis._shared_build(3, {}, False) == "analysis 3"

    asyncio.run(scenario())


def test_a_cached_analysis_is_served_whatever_is_running(monkeypatch):
    """/analysis/9636 is in backend/cache: it never reaches the cap, nor OpenF1."""
    async def no_openf1(*args, **kwargs):
        raise AssertionError("OpenF1 called")
    monkeypatch.setattr(analysis, "fetch_json", no_openf1)
    loop = asyncio.new_event_loop()
    busy = [loop.create_future() for _ in range(analysis.COLD_BUILD_LIMIT)]
    analysis._builds.update({100 + i: f for i, f in enumerate(busy)})
    try:
        r = TestClient(app).get("/analysis/9636")
        assert r.status_code == 200, r.text
    finally:
        loop.close()
