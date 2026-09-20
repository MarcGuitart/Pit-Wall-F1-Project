"""
OpenF1 token manager — https://openf1.org/auth.html

POST form-urlencoded {username, password} to the token URL → {access_token,
expires_in (3600), token_type: bearer}. Tokens live in memory only: never on
disk, never in the cache, never in a log line.

Renewal is proactive (RENEW_MARGIN_S before expiry) and single-flight: when
several requests notice a stale token at once, one fetches, the rest wait
for it. A 401 from the API triggers refresh(seen_token): if another request
already replaced that token, the caller just gets the new one.
"""
from __future__ import annotations

import asyncio
import logging
import time

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

RENEW_MARGIN_S = 300        # renew ~55 min into a 60-min token, don't wait for the 401


class OpenF1CredentialsError(Exception):
    """The token endpoint rejected the configured username/password."""


class TokenManager:
    def __init__(self) -> None:
        self._token: str | None = None
        self._expires_at: float = 0.0          # time.monotonic()
        self._expires_in: int = 0
        self._lock = asyncio.Lock()
        self.token_requests = 0                # how many times the token endpoint was called

    # ── state ────────────────────────────────────────────────────────────────

    @property
    def configured(self) -> bool:
        return bool(settings.openf1_username and settings.openf1_password.get_secret_value())

    @property
    def seconds_left(self) -> float:
        return max(0.0, self._expires_at - time.monotonic()) if self._token else 0.0

    def _fresh(self) -> bool:
        return self._token is not None and time.monotonic() < self._expires_at - RENEW_MARGIN_S

    def clear(self) -> None:
        self._token, self._expires_at, self._expires_in = None, 0.0, 0

    # ── API ──────────────────────────────────────────────────────────────────

    async def get_token(self) -> str | None:
        """
        Bearer token to send, or None for anonymous access.
        Order: username/password (auto-renewed) → legacy static OPENF1_API_TOKEN → None.
        """
        if not self.configured:
            return settings.openf1_api_token or None
        if self._fresh():
            return self._token
        async with self._lock:
            if not self._fresh():          # single flight: whoever got the lock first fetched
                await self._fetch()
            return self._token

    async def refresh(self, seen_token: str | None) -> str | None:
        """
        Called after a 401. Replaces the token unless another request already
        did (the caller's token is no longer the current one) — then the
        current token is returned without another token request.
        """
        if not self.configured:
            return None
        async with self._lock:
            if self._token is not None and self._token != seen_token:
                return self._token
            await self._fetch()
            return self._token

    async def _fetch(self) -> None:
        self.token_requests += 1
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                settings.openf1_token_url,
                data={
                    "username": settings.openf1_username,
                    "password": settings.openf1_password.get_secret_value(),
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        if resp.status_code in (400, 401, 403):
            # Do not echo the response body: it may quote the username.
            self.clear()
            logger.error("[OPENF1 AUTH] token endpoint answered %s — check OPENF1_USERNAME/PASSWORD", resp.status_code)
            raise OpenF1CredentialsError(f"OpenF1 token endpoint answered {resp.status_code}")
        resp.raise_for_status()
        body = resp.json()
        token = body.get("access_token")
        if not token:
            self.clear()
            raise OpenF1CredentialsError("OpenF1 token endpoint returned no access_token")
        self._expires_in = int(body.get("expires_in") or 3600)
        self._expires_at = time.monotonic() + self._expires_in
        self._token = token
        logger.info("[OPENF1 AUTH] token obtained, expires in %ds", self._expires_in)

    def status(self) -> dict:
        """Diagnostic view — never includes the token itself."""
        return {
            "configured": self.configured,
            "mode": "authenticated" if self.configured else ("static_token" if settings.openf1_api_token else "anonymous"),
            "has_token": self._token is not None,
            "expires_in_s": round(self.seconds_left),
            "token_lifetime_s": self._expires_in,
            "token_requests": self.token_requests,
        }


token_manager = TokenManager()
