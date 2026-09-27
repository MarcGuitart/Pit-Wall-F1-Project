"""
POST /access/redeem — exchange an access code for a signed token.
GET  /access/status  — what the token in the Authorization header is worth.

The token goes back in the response body and the browser stores it, sending it
as `Authorization: Bearer <token>` afterwards. Not a cookie: the frontend is on
pitwallengineer.com and this API is on Render, so a cookie between them is a
third-party cookie and Safari blocks those outright. A cookie-based gate would
work in development and fail silently for a large share of real visitors.

Redemption is rate-limited per IP. The codes are long, but an endpoint that will
answer "wrong code" as fast as you can ask is worth guessing at; a few attempts
an hour is not.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.core.access import (
    bearer_token,
    decode_token,
    encode_token,
    match_code,
    mint_token,
)
from app.core.config import settings
from app.core.errors import AppError
from app.core.ratelimit import SlidingWindow

router = APIRouter(tags=["access"])
logger = logging.getLogger(__name__)

# Ten tries an hour from one address. Enough that mistyping a dash is harmless,
# far too few to search a code space.
REDEEM_LIMIT = 10
REDEEM_WINDOW_S = 3600
_redeem_limiter = SlidingWindow(REDEEM_LIMIT, REDEEM_WINDOW_S)


class RedeemRequest(BaseModel):
    code: str = Field(min_length=1, max_length=200)


class RedeemResponse(BaseModel):
    token: str
    expires_at: int          # unix seconds
    expires_in: int          # seconds from now
    free_seasons: list[int]


class StatusResponse(BaseModel):
    pro: bool
    expires_at: int | None = None
    expires_in: int | None = None
    free_seasons: list[int]
    redemption_available: bool


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/access/redeem", response_model=RedeemResponse)
async def redeem(body: RedeemRequest, request: Request) -> RedeemResponse:
    ip = _client_ip(request)
    wait = _redeem_limiter.retry_after(ip)
    if wait > 0:
        raise AppError(
            "RATE_LIMITED",
            f"Too many access attempts. Try again in {int(wait) + 1} s.",
            status=429,
            details={"retry_after_seconds": int(wait) + 1, "scope": "ip"},
        )
    _redeem_limiter.hit(ip)

    if not settings.pro_access_configured:
        # Not the caller's fault and not a wrong code: say so, rather than
        # letting a misconfigured deployment look like a rejected code.
        logger.error("[PRO] redemption attempted but PRO_ACCESS_CODES/PRO_TOKEN_SECRET are not both set")
        raise AppError(
            "PRO_ACCESS_UNAVAILABLE",
            "Access codes are not enabled on this deployment.",
            status=503,
        )

    matched = match_code(body.code)
    if matched is None:
        logger.info("[PRO] rejected an access code from %s", ip)
        raise AppError(
            "INVALID_ACCESS_CODE",
            "That access code is not valid.",
            status=401,
        )

    token = mint_token(matched)
    logger.info("[PRO] issued a token for code %s (expires %s)", matched, token.expires_at)
    return RedeemResponse(
        token=encode_token(token),
        expires_at=token.expires_at,
        expires_in=token.expires_in,
        free_seasons=sorted(settings.free_seasons),
    )


@router.get("/access/status", response_model=StatusResponse)
async def status(request: Request) -> StatusResponse:
    """
    Never an error. An absent, expired or revoked token all answer pro: false,
    so the frontend has one thing to read and no reason to treat a stale token
    as a failure the visitor has to understand.
    """
    token = decode_token(bearer_token(request))
    return StatusResponse(
        pro=token is not None,
        expires_at=token.expires_at if token else None,
        expires_in=token.expires_in if token else None,
        free_seasons=sorted(settings.free_seasons),
        redemption_available=settings.pro_access_configured,
    )
