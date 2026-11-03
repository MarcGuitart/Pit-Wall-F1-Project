"""
POST /access/redeem — exchange an access code for a signed token.
GET  /access/status  — what the token in the Authorization header is worth.
GET  /access/promo   — the public promo code running now, for the banner.

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

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, Field

from app.core.access import (
    bearer_token,
    current_promo,
    decode_token,
    encode_token,
    find_promo,
    match_code,
    mint_token,
    is_open_access,
    open_access_until,
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
    ttl_days = None
    if matched is None:
        promo = find_promo(body.code)
        if promo is not None and not promo.active():
            logger.info("[PRO] an ended promo code was tried from %s", ip)
            raise AppError(
                "PROMO_EXPIRED",
                "That code has ended.",
                status=410,
            )
        if promo is not None:
            matched, ttl_days = promo.id, settings.pro_promo_token_ttl_days
    if matched is None:
        logger.info("[PRO] rejected an access code from %s", ip)
        raise AppError(
            "INVALID_ACCESS_CODE",
            "That access code is not valid.",
            status=401,
        )

    token = mint_token(matched, ttl_days=ttl_days)
    logger.info("[PRO] issued a token for code %s (expires %s)", matched, token.expires_at)
    return RedeemResponse(
        token=encode_token(token),
        expires_at=token.expires_at,
        expires_in=token.expires_in,
        free_seasons=sorted(settings.free_seasons),
    )


class OpenAccessResponse(BaseModel):
    open: bool
    until: str | None = None


@router.get("/access/open", response_model=OpenAccessResponse)
async def open_access(response: Response) -> OpenAccessResponse:
    """
    Public: whether the open week is on (block 50). `until` is OPEN_ACCESS_UNTIL
    as configured (ISO 8601 with its zone), also once it has passed; null when
    unset or unusable. The frontend reads this at run time, so the week opens,
    extends and closes with the variable on Render alone.
    """
    until = open_access_until()
    response.headers["Cache-Control"] = "public, max-age=60"
    return OpenAccessResponse(open=is_open_access(), until=until.isoformat() if until else None)


class PromoResponse(BaseModel):
    active: bool
    code: str | None = None
    until: str | None = None
    days: int | None = None     # how long a redeemed token lasts


@router.get("/access/promo", response_model=PromoResponse)
async def promo(response: Response) -> PromoResponse:
    """
    Public: the promo code running now (PRO_PROMO_CODES), the one ending last if
    several are. The code itself is in the answer on purpose: it is a public
    code the banner shows, and keeping it here keeps it out of the repo and the
    build. Nothing running answers active: false and no code.
    """
    response.headers["Cache-Control"] = "public, max-age=60"
    current = current_promo()
    if current is None:
        return PromoResponse(active=False)
    return PromoResponse(active=True, code=current.code, until=current.until.isoformat(),
                         days=settings.pro_promo_token_ttl_days)


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
