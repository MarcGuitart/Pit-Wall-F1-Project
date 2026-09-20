import asyncio
import logging
import random
from typing import Any

import httpx

from app.core.config import settings
from app.core import cache
from app.core.ratelimit import BlockingLimiter
from app.clients.openf1_auth import OpenF1CredentialsError, token_manager

logger = logging.getLogger(__name__)

_semaphore = asyncio.Semaphore(2)

# Outgoing limit: OPENF1_RATE_LIMIT_REQUESTS / OPENF1_RATE_LIMIT_WINDOW_S
# (default 25 / 10 s — the anonymous documented limit is 30 / 10 s per IP;
# the paid limit is measured with scripts/openf1_rate_probe.py).
RATE_LIMIT_REQUESTS = settings.openf1_rate_limit_requests
RATE_LIMIT_WINDOW_S = settings.openf1_rate_limit_window_s


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

    def __init__(
        self, endpoint: str, attempts: int, message: str | None = None,
        upstream_status: int | None = None,
    ) -> None:
        super().__init__(message or f"OpenF1 unreachable after {attempts} attempts: {endpoint}")
        self.endpoint = endpoint
        self.attempts = attempts
        self.upstream_status = upstream_status

    def details(self) -> dict[str, Any]:
        d: dict[str, Any] = {"endpoint": self.endpoint, "attempts": self.attempts}
        if self.upstream_status is not None:
            d["upstream_status"] = self.upstream_status
        return d


class OpenF1RateLimitError(OpenF1Error):
    """OpenF1 answered 429 on every retry."""

    def __init__(self, endpoint: str, attempts: int) -> None:
        super().__init__(endpoint, attempts, f"Rate limit after {attempts} attempts on {endpoint}")


class OpenF1AuthError(OpenF1Error):
    """
    OpenF1 answered 401 and a token renewal did not fix it (or none was
    possible): anonymous access to a protected endpoint, or rejected
    credentials. Not retried.
    """

    def __init__(self, endpoint: str, reason: str = "unauthorized") -> None:
        super().__init__(endpoint, 1, f"OpenF1 requires a valid account for {endpoint} ({reason})")
        self.reason = reason


async def _get(
    client: httpx.AsyncClient,
    endpoint: str,
    params: dict[str, Any],
) -> list[dict]:
    """
    One OpenF1 GET with everything every call must go through: semaphore,
    jitter, the outgoing limiter, bearer token (auto-renewed), retries with
    backoff, and typed errors (never a silent [] for an error response).

    401 handling: with an account, a 401 almost always means the token
    expired — renew once and retry; a second 401 is a credentials problem
    (OpenF1AuthError). Anonymous: 401 straight away.
    """
    last_exc: Exception | None = None
    auth_retried = False

    try:
        token = await token_manager.get_token()
    except OpenF1CredentialsError as exc:
        raise OpenF1AuthError(endpoint, "credentials rejected") from exc

    attempt = 0
    while attempt < _MAX_ATTEMPTS:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        try:
            async with _semaphore:
                # Jitter prevents burst of requests hitting OpenF1 simultaneously
                await asyncio.sleep(random.uniform(0.2, 0.6))
                await _limiter.acquire()
                resp = await client.get(
                    f"{settings.openf1_base_url}/{endpoint}",
                    params=params,
                    headers=headers,
                )

            if resp.status_code == 401:
                # Never return [] here — the caller would cache it as a real answer.
                if token_manager.configured and not auth_retried:
                    auth_retried = True
                    logger.info("[401] %s — renewing OpenF1 token and retrying once", endpoint)
                    try:
                        token = await token_manager.refresh(seen_token=token)
                    except OpenF1CredentialsError as exc:
                        raise OpenF1AuthError(endpoint, "credentials rejected") from exc
                    continue                    # does not consume a retry attempt
                reason = "token rejected after renewal" if auth_retried else "anonymous access"
                logger.error("[401 UNAUTHORIZED] %s %s — %s", endpoint, params, reason)
                raise OpenF1AuthError(endpoint, reason)

            if resp.status_code == 429:
                retry_after = int(
                    resp.headers.get("Retry-After", _BACKOFF[min(attempt, 3)])
                )
                logger.warning(
                    "[429 RETRY] %s %s — attempt %d, waiting %ds",
                    endpoint, params, attempt + 1, retry_after,
                )
                if attempt >= _MAX_ATTEMPTS - 1:
                    raise OpenF1RateLimitError(endpoint, _MAX_ATTEMPTS)
                await asyncio.sleep(retry_after)
                attempt += 1
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
                "OpenF1 attempt %d/%d failed for %s %s: %s — retrying in %ds",
                attempt + 1, _MAX_ATTEMPTS, endpoint, params, exc, wait,
            )
            if attempt < _MAX_ATTEMPTS - 1:
                await asyncio.sleep(wait)
        attempt += 1

    upstream = (
        last_exc.response.status_code if isinstance(last_exc, httpx.HTTPStatusError) else None
    )
    raise OpenF1Error(endpoint, _MAX_ATTEMPTS, upstream_status=upstream) from last_exc


async def _fetch_endpoint(
    client: httpx.AsyncClient,
    endpoint: str,
    session_key: int,
) -> list[dict]:
    return await _get(client, endpoint, {"session_key": session_key})


async def fetch_json(endpoint: str, **params: Any) -> list[dict]:
    """
    Public one-shot GET for non-race endpoints (sessions, meetings). Same
    limiter, backoff and typed errors as the race endpoints. Not cached here.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        return await _get(client, endpoint, params)


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
