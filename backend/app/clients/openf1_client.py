import asyncio
import logging
import random
from typing import Any

import httpx

from app.core.config import settings
from app.core import cache

logger = logging.getLogger(__name__)

_semaphore = asyncio.Semaphore(2)

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

_MAX_ATTEMPTS = 4
_BACKOFF = [2, 5, 10, 20]


class OpenF1RateLimitError(RuntimeError):
    pass


async def _fetch_endpoint(
    client: httpx.AsyncClient,
    endpoint: str,
    session_key: int,
) -> list[dict]:
    last_exc: Exception | None = None

    # Add token header if configured — OpenF1 now requires auth for live data
    headers: dict[str, str] = {}
    if settings.openf1_api_token:
        headers["Authorization"] = f"Bearer {settings.openf1_api_token}"

    for attempt in range(_MAX_ATTEMPTS):
        try:
            async with _semaphore:
                # Jitter prevents burst of requests hitting OpenF1 simultaneously
                await asyncio.sleep(random.uniform(0.2, 0.6))
                resp = await client.get(
                    f"{settings.openf1_base_url}/{endpoint}",
                    params={"session_key": session_key},
                    headers=headers,
                )

            if resp.status_code == 401:
                # Fast-fail: retrying won't help without a valid token
                logger.error(
                    "[401 UNAUTHORIZED] %s for %s — set OPENF1_API_TOKEN to fetch new sessions",
                    endpoint, session_key,
                )
                return []

            if resp.status_code == 429:
                retry_after = int(
                    resp.headers.get("Retry-After", _BACKOFF[min(attempt, 3)])
                )
                logger.warning(
                    "[429 RETRY] %s for %s — attempt %d, waiting %ds",
                    endpoint, session_key, attempt + 1, retry_after,
                )
                if attempt >= _MAX_ATTEMPTS - 1:
                    raise OpenF1RateLimitError(
                        f"Rate limit after {_MAX_ATTEMPTS} attempts on {endpoint}"
                    )
                await asyncio.sleep(retry_after)
                continue

            resp.raise_for_status()
            return resp.json()

        except OpenF1RateLimitError:
            raise
        except (httpx.HTTPStatusError, httpx.RequestError) as exc:
            last_exc = exc
            wait = _BACKOFF[min(attempt, 3)]
            logger.warning(
                "OpenF1 attempt %d/%d failed for %s/%s: %s — retrying in %ds",
                attempt + 1, _MAX_ATTEMPTS, session_key, endpoint, exc, wait,
            )
            if attempt < _MAX_ATTEMPTS - 1:
                await asyncio.sleep(wait)

    raise RuntimeError(
        f"OpenF1 unreachable after {_MAX_ATTEMPTS} attempts: {endpoint}"
    ) from last_exc


async def fetch_all(session_key: int) -> dict[str, list[dict]]:
    """
    Fetch all race endpoints for a session, checking file cache first.
    Sequential per-endpoint loop with jitter prevents 429 bursts.
    """
    results: dict[str, list[dict]] = {}

    async with httpx.AsyncClient(timeout=30.0) as client:
        for endpoint in RACE_ENDPOINTS:
            cached = cache.get(session_key, endpoint)
            if cached is not None:
                results[endpoint] = cached
            else:
                logger.info("[FETCHING] %s for %s", endpoint, session_key)
                try:
                    data = await _fetch_endpoint(client, endpoint, session_key)
                    cache.set(session_key, endpoint, data)
                    results[endpoint] = data
                except (RuntimeError, OpenF1RateLimitError) as exc:
                    logger.error(
                        "[FETCH FAILED] %s for %s: %s", endpoint, session_key, exc
                    )
                    # Continue with other endpoints; caller decides what to do with gaps

    return results
