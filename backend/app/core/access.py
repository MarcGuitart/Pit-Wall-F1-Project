"""
PRO access: which seasons need a code, and the signed token that proves one.

Free seasons are 2023 and 2024. Everything else — 2025, the current season, live
mode — is PRO. Phase one has no payments: access is a code the owner issues by
hand, redeemed once for a token the browser then sends on every request.

Three decisions worth stating, because each rules out something easier:

  A token, not the code itself. The code is long-lived and shared between the
  owner's devices; a token expires, carries no secret of its own, and can be
  thrown away by the browser without invalidating the code.

  The Authorization header, not a cookie. The frontend is on pitwallengineer.com
  (Netlify) and the API is on Render: a cookie between them is a third-party
  cookie, and Safari's ITP blocks those outright. A cookie-based gate would work
  in development and fail silently for a large share of real visitors.

  No email-based access. There is no verification step, so "type your email to
  unlock" unlocks for anyone who can type someone else's address — including the
  owner's, which is published in the repo's commit history. A code that only the
  owner can hand out is the only thing here that actually gates anything.

Token format:  v1.<payload>.<signature>
  payload    base64url JSON {"cid": code id, "exp": epoch, "iat": epoch}
  signature  base64url HMAC-SHA256 of "v1.<payload>" under PRO_TOKEN_SECRET

The code never goes into the token. What goes in is a short digest of it, so a
code the owner revokes stops working on every token that was minted from it, and
a leaked token discloses nothing about the code that made it.

Everything here fails closed. No secret configured means no token verifies and no
code redeems, so a misconfigured deployment locks the PRO seasons rather than
opening them.

Open week (block 50): OPEN_ACCESS_UNTIL, an ISO 8601 instant with its time zone
(e.g. 2026-11-03T10:00:00+01:00), opens every PRO check to everyone until then,
the API's season gate and the live server's alike. Read from the environment on
each check, so extending or closing the week is a change of that variable on
Render, nothing else; past that instant everything is as before without a
deploy. A value without a time zone, or one that does not parse, is ignored
(closed) and logged: an ambiguous instant must not open anything.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import Request

from app.core.billing_revocation import is_revoked
from app.core.branding import PRO_NAME
from app.core.config import settings
from app.core.errors import AppError

logger = logging.getLogger(__name__)

VERSION = "v1"
CODE_ID_LENGTH = 12        # hex characters of sha256(code): enough to tell codes apart
# Tokens minted for a Stripe subscription (block 44) carry this code id prefix
# and the subscription id in "sub". They are not tied to a configured code, so
# revoking codes does not touch them; they end with the paid period instead,
# and /billing/renew asks Stripe before extending one.
SUBSCRIPTION_PREFIX = "stripe:"


def b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def code_id(code: str) -> str:
    """A stable, non-reversible identifier for a code."""
    return hashlib.sha256(code.strip().encode()).hexdigest()[:CODE_ID_LENGTH]


def known_code_ids() -> set[str]:
    ids = {code_id(c) for c in settings.pro_access_codes if c.strip()}
    # Every configured promo, ended or not: a code that stops redeeming must not
    # take the tokens it already minted with it. Removing the entry does.
    return ids | {p.id for p in promo_codes()}


def match_code(submitted: str) -> str | None:
    """
    The id of the configured code this one is, or None.

    Compared with compare_digest over the digests, so the time taken does not
    depend on how many leading characters were right.
    """
    submitted = (submitted or "").strip()
    if not submitted:
        return None
    candidate = code_id(submitted)
    matched: str | None = None
    for known in known_code_ids():
        if hmac.compare_digest(candidate, known):
            matched = known
    return matched


# ── promo codes ──────────────────────────────────────────────────────────────
#
# PRO_PROMO_CODES: public codes, CODE|ISO 8601 instant with its zone. Anyone may
# redeem one, as often as they like, until that instant, in any case. What they
# mint is an ordinary token with its own expiry (PRO_PROMO_TOKEN_TTL_DAYS), so the
# code ending stops new redemptions and leaves redeemed ones alone. An entry
# without "|", without a zone, or with a date that does not parse is ignored and
# logged, as OPEN_ACCESS_UNTIL is: an ambiguous end must not open anything.

PROMO_PREFIX = "promo:"


@dataclass(frozen=True)
class PromoCode:
    code: str              # as configured; matched without regard to case
    until: datetime

    @property
    def id(self) -> str:
        return PROMO_PREFIX + code_id(self.code.upper())

    def active(self, now: datetime | None = None) -> bool:
        return (now or _now()) < self.until


def promo_codes() -> list[PromoCode]:
    promos: list[PromoCode] = []
    for entry in settings.pro_promo_codes:
        code, sep, raw_until = (entry or "").partition("|")
        code, raw_until = code.strip(), raw_until.strip()
        if not code or not sep:
            logger.warning("[PRO] a PRO_PROMO_CODES entry is not CODE|instant: ignored")
            continue
        try:
            until = datetime.fromisoformat(raw_until.replace("Z", "+00:00"))
        except ValueError:
            logger.warning("[PRO] a PRO_PROMO_CODES end %r is not an ISO 8601 instant: ignored", raw_until)
            continue
        if until.tzinfo is None:
            logger.warning("[PRO] a PRO_PROMO_CODES end %r has no time zone: ignored", raw_until)
            continue
        promos.append(PromoCode(code=code, until=until))
    return promos


def find_promo(submitted: str) -> PromoCode | None:
    """The configured promo this code is, active or not, compared without case."""
    submitted = (submitted or "").strip()
    if not submitted:
        return None
    candidate = PROMO_PREFIX + code_id(submitted.upper())
    found: PromoCode | None = None
    for promo in promo_codes():
        if hmac.compare_digest(candidate, promo.id):
            found = promo
    return found


def current_promo(now: datetime | None = None) -> PromoCode | None:
    """The active promo ending last, for the banner; None when none is running."""
    running = [p for p in promo_codes() if p.active(now)]
    return max(running, key=lambda p: p.until) if running else None


# ── seasons ──────────────────────────────────────────────────────────────────

def is_free_season(year: int | None) -> bool:
    """
    Unknown years are PRO, not free. A session whose year we cannot read must not
    fall open — the safe default for a gate is closed.
    """
    return isinstance(year, int) and year in settings.free_seasons


def is_pro_season(year: int | None) -> bool:
    return not is_free_season(year)


# ── tokens ───────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class AccessToken:
    code_id: str
    issued_at: int
    expires_at: int
    subscription: str | None = None

    @property
    def expires_in(self) -> int:
        return max(0, self.expires_at - int(time.time()))


def _sign(signing_input: str) -> str:
    secret = settings.pro_token_secret.get_secret_value().encode()
    return b64(hmac.new(secret, signing_input.encode(), hashlib.sha256).digest())


def mint_token(matched_code_id: str, ttl_days: int | None = None) -> AccessToken:
    """Mint a token for an already-verified code id. Raises if unconfigured."""
    if not settings.pro_token_secret.get_secret_value():
        raise AppError(
            "PRO_ACCESS_UNAVAILABLE",
            "Access codes are not enabled on this deployment.",
            status=503,
        )
    now = int(time.time())
    days = settings.pro_token_ttl_days if ttl_days is None else ttl_days
    token = AccessToken(code_id=matched_code_id, issued_at=now, expires_at=now + days * 86400)
    return token


def subscription_token(subscription_id: str, issued_at: int, expires_at: int) -> AccessToken:
    """A token for a paid Stripe subscription. Raises if unconfigured."""
    if not settings.pro_token_secret.get_secret_value():
        raise AppError(
            "PRO_ACCESS_UNAVAILABLE",
            "Access codes are not enabled on this deployment.",
            status=503,
        )
    cid = SUBSCRIPTION_PREFIX + hashlib.sha256(subscription_id.encode()).hexdigest()[:CODE_ID_LENGTH]
    return AccessToken(code_id=cid, issued_at=issued_at, expires_at=expires_at, subscription=subscription_id)


def encode_token(token: AccessToken) -> str:
    claims = {"cid": token.code_id, "iat": token.issued_at, "exp": token.expires_at}
    if token.subscription:
        claims["sub"] = token.subscription
    payload = b64(json.dumps(claims, separators=(",", ":"), sort_keys=True).encode())
    signing_input = f"{VERSION}.{payload}"
    return f"{signing_input}.{_sign(signing_input)}"


def decode_token(raw: str, allow_expired: bool = False) -> AccessToken | None:
    """
    The token's claims, or None for anything that is not a currently valid token
    signed by us: wrong version, tampered payload, bad signature, expired, or a
    code that has since been revoked. One return value for every failure, so no
    caller can accidentally treat "expired" as a softer kind of invalid.
    """
    if not settings.pro_token_secret.get_secret_value():
        return None
    parts = (raw or "").strip().split(".")
    if len(parts) != 3:
        return None
    version, payload, signature = parts
    if version != VERSION:
        return None
    if not hmac.compare_digest(signature, _sign(f"{version}.{payload}")):
        return None
    try:
        claims = json.loads(unb64(payload))
        cid = claims["cid"]
        exp = int(claims["exp"])
        iat = int(claims["iat"])
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        return None
    if not isinstance(cid, str):
        return None
    # allow_expired is for /billing/renew only: it asks Stripe before minting.
    if exp <= int(time.time()) and not allow_expired:
        return None
    if cid.startswith(SUBSCRIPTION_PREFIX):
        sub = claims.get("sub")
        if not isinstance(sub, str) or not sub:
            return None
        # The owner's revocation list (PAYMENTS_REVOKED_SUBS) beats the
        # signature: a revoked subscription's tokens stop at once.
        if is_revoked(sub):
            return None
        return AccessToken(code_id=cid, issued_at=iat, expires_at=exp, subscription=sub)
    # A revoked code must not keep working until its tokens expire.
    if cid not in known_code_ids():
        return None
    return AccessToken(code_id=cid, issued_at=iat, expires_at=exp)


# ── the gate ─────────────────────────────────────────────────────────────────

def bearer_token(request: Request) -> str:
    header = request.headers.get("authorization") or ""
    scheme, _, value = header.partition(" ")
    return value.strip() if scheme.lower() == "bearer" else ""


# ── open week ────────────────────────────────────────────────────────────────

OPEN_ACCESS_ENV = "OPEN_ACCESS_UNTIL"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def open_access_until() -> datetime | None:
    """OPEN_ACCESS_UNTIL as an aware datetime, or None when unset or unusable."""
    raw = (os.environ.get(OPEN_ACCESS_ENV) or "").strip()
    if not raw:
        return None
    try:
        until = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        logger.warning("[PRO] %s=%r is not an ISO 8601 instant: ignored", OPEN_ACCESS_ENV, raw)
        return None
    if until.tzinfo is None:
        logger.warning("[PRO] %s=%r has no time zone: ignored", OPEN_ACCESS_ENV, raw)
        return None
    return until


def is_open_access(now: datetime | None = None) -> bool:
    until = open_access_until()
    return until is not None and (now or _now()) < until


def has_pro_access(request: Request) -> bool:
    """A valid user token, or the open week (OPEN_ACCESS_UNTIL) still running."""
    return is_open_access() or decode_token(bearer_token(request)) is not None


def has_internal_build_access(request: Request) -> bool:
    """
    A second, separate way through the gate: a shared secret for the
    publication pipeline, which computes a PRO-season analysis before anyone
    could hold a user token for it — the analysis has to exist before it can be
    committed and served.

    Not a weaker PRO token and not minted through /access/redeem: it is a
    single static secret, compared with compare_digest, sent as its own header
    so it is never confused with a user's Authorization: Bearer. It grants
    nothing a normal request could not eventually reach anyway — the analysis
    it triggers is about to be committed to the repo and served the same way
    any published race is — only bypasses waiting on a user token that, for a
    server-to-server build step, was never going to exist.

    Configured only where the publication pipeline runs (a GitHub Actions
    secret), never on Render: the live API never needs to accept this header
    from anyone, since real readers go through /access/redeem like everyone
    else.
    """
    secret = settings.internal_build_secret.get_secret_value()
    if not secret:
        return False
    provided = request.headers.get("x-internal-build-secret", "")
    return bool(provided) and hmac.compare_digest(provided, secret)


def pro_required(year: int | None, session_key: int | None = None) -> AppError:
    """
    402 Payment Required. It is the one status that means exactly this, and the
    machine-readable answer is the envelope's `code` in any case; the frontend
    switches on PRO_REQUIRED, not on the number.
    """
    return AppError(
        "PRO_REQUIRED",
        f"This season is part of {PRO_NAME}. Races from 2025 onwards and the "
        "current season with Live mode need an access code.",
        status=402,
        details={
            "session_key": session_key,
            "year": year,
            "free_seasons": sorted(settings.free_seasons),
        },
    )


def require_season_access(request: Request, year: int | None, session_key: int | None = None) -> None:
    """Raise PRO_REQUIRED unless this season is free, or the caller holds a
    user token, or this is the publication pipeline building it."""
    if is_free_season(year):
        return
    if has_pro_access(request):
        return
    if has_internal_build_access(request):
        return
    logger.info("[PRO] refused session %s (year %s): no valid token", session_key, year)
    raise pro_required(year, session_key)
