"""
OpenF1 token manager and the 401-renew-retry rule. The token endpoint and
the API are both httpx.MockTransport; no test touches real credentials
(conftest blanks whatever the developer's .env holds).
"""
from __future__ import annotations

import asyncio
import time

import httpx
import pytest
from pydantic import SecretStr

from app.clients import openf1_client
from app.clients.openf1_auth import RENEW_MARGIN_S, OpenF1CredentialsError, token_manager
from app.core.config import settings
from app.core.ratelimit import BlockingLimiter


class FakeOpenF1:
    """Token endpoint + /v1 API. Tokens are 'tok-1', 'tok-2', ... in issue order."""

    def __init__(self, valid_tokens: set[str] | None = None, token_status: int = 200, expires_in: int = 3600):
        self.issued = 0
        self.token_status = token_status
        self.expires_in = expires_in
        self.valid = valid_tokens          # None = every issued token is valid
        self.api_calls: list[str | None] = []
        self.sessions_calls = 0

    def __call__(self, req: httpx.Request) -> httpx.Response:
        if req.url.path == "/token":
            assert req.method == "POST"
            assert "password" in req.content.decode() and "username" in req.content.decode()
            if self.token_status != 200:
                return httpx.Response(self.token_status, json={"detail": "bad credentials"})
            self.issued += 1
            return httpx.Response(200, json={"access_token": f"tok-{self.issued}", "expires_in": self.expires_in, "token_type": "bearer"})
        auth = req.headers.get("authorization")
        token = auth.removeprefix("Bearer ") if auth else None
        self.api_calls.append(token)
        if req.url.path.endswith("/sessions"):
            self.sessions_calls += 1
            return httpx.Response(200, json=[])
        if token is None or (self.valid is not None and token not in self.valid):
            return httpx.Response(401, json={"detail": "Not authenticated"})
        return httpx.Response(200, json=[{"lap_number": 1, "driver_number": 1}])


@pytest.fixture
def fake(monkeypatch):
    def install(fake_api: FakeOpenF1):
        real = httpx.AsyncClient

        class Patched(real):
            def __init__(self, *a, **kw):
                kw["transport"] = httpx.MockTransport(fake_api)
                super().__init__(*a, **kw)
        monkeypatch.setattr(httpx, "AsyncClient", Patched)
        monkeypatch.setattr(openf1_client, "_BACKOFF", [0, 0, 0, 0])
        # asyncio primitives bind to the first loop that uses them; every
        # asyncio.run() here is a new loop, so give each test fresh ones
        monkeypatch.setattr(openf1_client, "_semaphore", asyncio.Semaphore(2))
        monkeypatch.setattr(openf1_client, "_limiter", BlockingLimiter(1000, 10))
        token_manager._lock = asyncio.Lock()
        return fake_api
    return install


@pytest.fixture
def account(monkeypatch):
    monkeypatch.setattr(settings, "openf1_username", "user@example.com")
    monkeypatch.setattr(settings, "openf1_password", SecretStr("hunter2"))


async def _get(endpoint: str = "laps") -> list[dict]:
    async with httpx.AsyncClient() as client:
        return await openf1_client._get(client, endpoint, {"session_key": 1})


# ── anonymous mode ───────────────────────────────────────────────────────────

def test_without_credentials_the_client_is_anonymous(fake):
    api = fake(FakeOpenF1(valid_tokens=set()))
    assert token_manager.configured is False
    assert asyncio.run(token_manager.get_token()) is None
    assert token_manager.status()["mode"] == "anonymous"
    # /sessions is public in the fake: works with no Authorization header at all
    assert asyncio.run(_get("sessions")) == []
    assert api.api_calls == [None] and api.issued == 0


def test_anonymous_401_is_an_auth_error_without_token_requests(fake):
    api = fake(FakeOpenF1(valid_tokens=set()))
    with pytest.raises(openf1_client.OpenF1AuthError) as exc:
        asyncio.run(_get("laps"))
    assert exc.value.reason == "anonymous access"
    assert api.issued == 0


def test_legacy_static_token_still_works(fake, monkeypatch):
    monkeypatch.setattr(settings, "openf1_api_token", "static-token")
    api = fake(FakeOpenF1(valid_tokens={"static-token"}))
    assert asyncio.run(_get("laps"))
    assert api.api_calls == ["static-token"] and api.issued == 0


# ── token lifecycle ──────────────────────────────────────────────────────────

def test_token_is_fetched_once_and_reused(fake, account):
    api = fake(FakeOpenF1())
    asyncio.run(_get("laps")); asyncio.run(_get("laps"))
    assert api.issued == 1
    assert api.api_calls == ["tok-1", "tok-1"]
    st = token_manager.status()
    assert st["mode"] == "authenticated" and st["has_token"] and 3000 < st["expires_in_s"] <= 3600
    assert "tok-1" not in str(st)          # diagnostics never leak the token


def test_token_is_renewed_before_it_expires(fake, account):
    api = fake(FakeOpenF1(expires_in=3600))
    asyncio.run(_get("laps"))
    # jump to 56 minutes in: inside the renewal margin, before the hard expiry
    token_manager._expires_at = time.monotonic() + RENEW_MARGIN_S - 60
    asyncio.run(_get("laps"))
    assert api.issued == 2
    assert api.api_calls == ["tok-1", "tok-2"]


def test_expired_token_401_renews_and_retries_once(fake, account):
    api = fake(FakeOpenF1(valid_tokens={"tok-2"}))     # tok-1 is 'expired' server-side
    assert asyncio.run(_get("laps"))
    assert api.api_calls == ["tok-1", "tok-2"]         # one 401, one renewal, one retry
    assert api.issued == 2


def test_401_after_renewal_is_unauthorized_without_more_retries(fake, account):
    api = fake(FakeOpenF1(valid_tokens=set()))          # nothing is ever accepted
    with pytest.raises(openf1_client.OpenF1AuthError) as exc:
        asyncio.run(_get("laps"))
    assert exc.value.reason == "token rejected after renewal"
    assert api.api_calls == ["tok-1", "tok-2"]         # exactly one retry
    assert api.issued == 2


def test_rejected_credentials_raise_without_calling_the_api(fake, account):
    api = fake(FakeOpenF1(token_status=401))
    with pytest.raises(openf1_client.OpenF1AuthError) as exc:
        asyncio.run(_get("laps"))
    assert exc.value.reason == "credentials rejected"
    assert api.api_calls == []
    assert token_manager.status()["has_token"] is False


def test_concurrent_requests_share_one_token_request(fake, account):
    api = fake(FakeOpenF1())

    async def burst():
        async with httpx.AsyncClient() as client:
            return await asyncio.gather(*(openf1_client._get(client, "laps", {"session_key": i}) for i in range(6)))

    results = asyncio.run(burst())
    assert len(results) == 6 and api.issued == 1
    assert set(api.api_calls) == {"tok-1"}


def test_concurrent_401s_trigger_a_single_renewal(fake, account):
    api = fake(FakeOpenF1(valid_tokens={"tok-2"}))     # every tok-1 call gets a 401 at once

    async def burst():
        async with httpx.AsyncClient() as client:
            return await asyncio.gather(*(openf1_client._get(client, "laps", {"session_key": i}) for i in range(5)))

    results = asyncio.run(burst())
    assert len(results) == 5
    assert api.issued == 2                              # tok-1 once, tok-2 once — not once per request
    assert api.api_calls.count("tok-2") == 5


def test_error_responses_are_never_cached(fake, account, monkeypatch, tmp_path):
    """Block 3 rule survives auth: a 401 (even after renewal) writes nothing."""
    monkeypatch.setattr(settings, "cache_dir", str(tmp_path))
    fake(FakeOpenF1(valid_tokens=set()))
    with pytest.raises(openf1_client.OpenF1AuthError):
        asyncio.run(openf1_client.fetch_all(424242))
    assert list(tmp_path.iterdir()) == []


def test_credentials_error_message_has_no_secret():
    err = OpenF1CredentialsError("OpenF1 token endpoint answered 401")
    assert "hunter2" not in str(err) and "password" not in str(err).lower()
