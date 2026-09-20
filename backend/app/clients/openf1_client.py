import asyncio
import logging
import random
from typing import Any

import httpx

from app.core.config import settings
from app.core import cache
from app.core.ratelimit import BlockingLimiter

logger = logging.getLogger(__name__)

_semaphore = asyncio.Semaphore(2)

# OpenF1's documented limit is 30 requests per 10 s per IP. Keep a margin so
# the semaphore + jitter can never burst past it.
RATE_LIMIT_REQUESTS = 25
RATE_LIMIT_WINDOW_S = 10.0


_limiter = BlockingLimiter(RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW_S)

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


class OpenF1Error(RuntimeError):
    """An endpoint could not be fetched after all retries."""

    def __init__(self, endpoint: str, attempts: int, message: str | None = None) -> None:
        super().__init__(message or f"OpenF1 unreachable after {attempts} attempts: {endpoint}")
        self.endpoint = endpoint
        self.attempts = attempts


class OpenF1RateLimitError(OpenF1Error):
    """OpenF1 answered 429 on every retry."""

    def __init__(self, endpoint: str, attempts: int) -> None:
        super().__init__(endpoint, attempts, f"Rate limit after {attempts} attempts on {endpoint}")


class OpenF1AuthError(OpenF1Error):
    """OpenF1 answered 401: no token, or the token was rejected. Not retried."""

    def __init__(self, endpoint: str) -> None:
        super().__init__(endpoint, 1, f"OpenF1 requires a valid API token for {endpoint}")


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
                await _limiter.acquire()
                resp = await client.get(
                    f"{settings.openf1_base_url}/{endpoint}",
                    params={"session_key": session_key},
                    headers=headers,
                )

            if resp.status_code == 401:
                # Fast-fail: retrying won't help without a valid token. Never
                # return [] here — the caller would cache it as a real answer.
                logger.error(
                    "[401 UNAUTHORIZED] %s for %s — set OPENF1_API_TOKEN to fetch new sessions",
                    endpoint, session_key,
                )
                raise OpenF1AuthError(endpoint)

            if resp.status_code == 429:
                retry_after = int(
                    resp.headers.get("Retry-After", _BACKOFF[min(attempt, 3)])
                )
                logger.warning(
                    "[429 RETRY] %s for %s — attempt %d, waiting %ds",
                    endpoint, session_key, attempt + 1, retry_after,
                )
                if attempt >= _MAX_ATTEMPTS - 1:
                    raise OpenF1RateLimitError(endpoint, _MAX_ATTEMPTS)
                await asyncio.sleep(retry_after)
                continue

            resp.raise_for_status()
            data = resp.json()
            if not isinstance(data, list):
                # OpenF1 always answers with a JSON array; anything else is an
                # error page and must not be cached.
                raise OpenF1Error(endpoint, attempt + 1, f"Unexpected OpenF1 payload for {endpoint}")
            return data   # a legitimate empty list is a valid, cacheable answer

        except OpenF1Error:
            raise   # 401, final 429, bad payload: no retry
        except (httpx.HTTPStatusError, httpx.RequestError) as exc:
            last_exc = exc
            wait = _BACKOFF[min(attempt, 3)]
            logger.warning(
                "OpenF1 attempt %d/%d failed for %s/%s: %s — retrying in %ds",
                attempt + 1, _MAX_ATTEMPTS, session_key, endpoint, exc, wait,
            )
            if attempt < _MAX_ATTEMPTS - 1:
                await asyncio.sleep(wait)

    raise OpenF1Error(endpoint, _MAX_ATTEMPTS) from last_exc


async def fetch_all(session_key: int) -> dict[str, list[dict]]:
    """
    Fetch all race endpoints for a session, checking file cache first.
    Sequential per-endpoint loop with jitter prevents 429 bursts.

    Raises OpenF1RateLimitError / OpenF1Error on the first endpoint that fails;
    endpoints fetched before it are already cached, so a retry resumes there.
    """
    results: dict[str, list[dict]] = {}

    async with httpx.AsyncClient(timeout=30.0) as client:
        for endpoint in RACE_ENDPOINTS:
            cached = cache.get(session_key, endpoint)
            if cached is not None:
                results[endpoint] = cached
                continue
            logger.info("[FETCHING] %s for %s", endpoint, session_key)
            try:
                data = await _fetch_endpoint(client, endpoint, session_key)
            except OpenF1Error as exc:
                logger.error("[FETCH FAILED] %s for %s: %s", endpoint, session_key, exc)
                raise
            cache.set(session_key, endpoint, data)
            results[endpoint] = data

    return results
