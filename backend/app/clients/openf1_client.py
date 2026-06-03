import asyncio
import logging
from typing import Any

import httpx

from app.core.config import settings
from app.core import cache

logger = logging.getLogger(__name__)

_semaphore = asyncio.Semaphore(3)

RACE_ENDPOINTS = [
    "laps",
    "stints",
    "pit",
    "position",
    "intervals",
    "race_control",
    "weather",
    "drivers",
]


async def _fetch_with_retry(
    client: httpx.AsyncClient, url: str, params: dict[str, Any]
) -> list[dict]:
    last_exc: Exception | None = None
    for attempt, wait in enumerate([0, 1, 2, 4], start=1):
        if wait:
            await asyncio.sleep(wait)
        try:
            async with _semaphore:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                return resp.json()
        except (httpx.HTTPStatusError, httpx.RequestError) as exc:
            last_exc = exc
            logger.warning("OpenF1 attempt %d failed for %s: %s", attempt, url, exc)
    raise RuntimeError(
        f"OpenF1 unreachable after 3 retries: {url}"
    ) from last_exc


async def _fetch_endpoint(
    client: httpx.AsyncClient, endpoint: str, session_key: int
) -> tuple[str, list[dict]]:
    cached = cache.get(session_key, endpoint)
    if cached is not None:
        logger.debug("Cache hit: %s/%s", session_key, endpoint)
        return endpoint, cached

    url = f"{settings.openf1_base_url}/{endpoint}"
    data = await _fetch_with_retry(client, url, {"session_key": session_key})
    cache.set(session_key, endpoint, data)
    logger.info("Fetched and cached %s/%s (%d records)", session_key, endpoint, len(data))
    return endpoint, data


async def fetch_all(session_key: int) -> dict[str, list[dict]]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        tasks = [
            _fetch_endpoint(client, ep, session_key)
            for ep in RACE_ENDPOINTS
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    out: dict[str, list[dict]] = {}
    for result in results:
        if isinstance(result, BaseException):
            logger.error("Endpoint fetch failed: %s", result)
            continue
        ep, data = result
        out[ep] = data

    return out
