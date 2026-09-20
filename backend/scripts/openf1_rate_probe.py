"""
Empirical OpenF1 rate-limit probe — run from backend/:
    python scripts/openf1_rate_probe.py [--anonymous] [--max-rate 400]

Sends a cheap request (/sessions?session_key=9636) at increasing rates
(requests per 10 s), one 10-second window per rate, until a 429 appears,
then reports the highest clean rate, the rate that broke, how many requests
got through in the breaking window, and the Retry-After header. It does not
change any setting: the number is for a human to decide on.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
import time

sys.path.insert(0, ".")

import httpx  # noqa: E402

from app.clients.openf1_auth import token_manager  # noqa: E402
from app.core.config import settings  # noqa: E402

URL = f"{settings.openf1_base_url}/sessions"
WINDOW_S = 10.0


async def window(client: httpx.AsyncClient, rate: int, headers: dict) -> tuple[int, int, str | None, float]:
    """Fire `rate` requests evenly over WINDOW_S; return (ok, 429s, retry_after, first_429_at_s)."""
    ok = too_many = 0
    retry_after: str | None = None
    first_429_at = -1.0
    t0 = time.monotonic()

    async def one(i: int) -> None:
        nonlocal ok, too_many, retry_after, first_429_at
        await asyncio.sleep(i * WINDOW_S / rate)
        try:
            r = await client.get(URL, params={"session_key": 9636}, headers=headers)
        except httpx.RequestError:
            return
        if r.status_code == 429:
            too_many += 1
            if first_429_at < 0:
                first_429_at = time.monotonic() - t0
                retry_after = r.headers.get("retry-after")
        elif r.status_code == 200:
            ok += 1

    await asyncio.gather(*(one(i) for i in range(rate)))
    return ok, too_many, retry_after, first_429_at


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--anonymous", action="store_true", help="probe without a token")
    ap.add_argument("--max-rate", type=int, default=400, help="stop escalating at this many req / 10 s")
    ap.add_argument("--steady", type=float, default=0.0,
                    help="instead of escalating windows: send this many req/s for --seconds and report when the first 429 lands")
    ap.add_argument("--seconds", type=float, default=75.0)
    args = ap.parse_args()

    headers: dict = {}
    if not args.anonymous:
        token = await token_manager.get_token()
        if not token:
            print("no credentials configured — use --anonymous or set OPENF1_USERNAME/PASSWORD")
            return 1
        headers["Authorization"] = f"Bearer {token}"
    mode = "anonymous" if args.anonymous else "account"
    print(f"mode={mode} window={WINDOW_S:.0f}s target={URL}")

    if args.steady:
        # Steady stream: tells a per-minute budget apart from a per-10 s one.
        ok = 0
        t0 = time.monotonic()
        async with httpx.AsyncClient(timeout=20) as client:
            while time.monotonic() - t0 < args.seconds:
                r = await client.get(URL, params={"session_key": 9636}, headers=headers)
                if r.status_code == 429:
                    print(f"  first 429 after {ok} successful requests in {time.monotonic() - t0:.1f}s "
                          f"at {args.steady} req/s · Retry-After={r.headers.get('retry-after')} · body={r.text[:120]}")
                    return 0
                ok += r.status_code == 200
                await asyncio.sleep(1 / args.steady)
        print(f"  no 429: {ok} successful requests in {args.seconds:.0f}s at {args.steady} req/s")
        return 0

    rates = [20, 30, 45, 60, 90, 120, 180, 240, 320, 400]
    last_clean = 0
    async with httpx.AsyncClient(timeout=20) as client:
        for rate in rates:
            if rate > args.max_rate:
                break
            ok, n429, retry_after, at = await window(client, rate, headers)
            print(f"  {rate:4d} req/10s → 200×{ok:<4d} 429×{n429:<4d}" + (f"  first 429 after {ok} ok at {at:.1f}s, Retry-After={retry_after}" if n429 else ""))
            if n429:
                print(f"\nobserved limit ({mode}): last clean rate {last_clean} req/10s; "
                      f"{rate} req/10s broke after {ok} successful requests in the window.")
                return 0
            last_clean = rate
            await asyncio.sleep(WINDOW_S)     # let the window drain before the next rate
    print(f"\nno 429 up to {last_clean} req/10s ({mode}).")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
