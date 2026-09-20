"""
OpenF1 access diagnostic — run from backend/:  python scripts/openf1_auth_check.py

Confirms, without printing any secret:
  1. mode (authenticated / static token / anonymous) and that a token is obtained
  2. token lifetime and renewal margin
  3. an authenticated request through the real client path (_get)
  4. what the account unlocks vs anonymous: older seasons, protected
     endpoints, extra fields (stop_duration on older races)
"""
from __future__ import annotations

import asyncio
import json
import sys
import time

sys.path.insert(0, ".")

import httpx  # noqa: E402

from app.clients import openf1_client  # noqa: E402
from app.clients.openf1_auth import RENEW_MARGIN_S, token_manager  # noqa: E402
from app.core.config import settings  # noqa: E402

BASE = settings.openf1_base_url


async def anon(path: str, **params) -> tuple[int, list | dict | None]:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{BASE}/{path}", params=params)
        try:
            return r.status_code, r.json()
        except ValueError:
            return r.status_code, None


async def auth(path: str, **params) -> tuple[int, list | dict | None]:
    token = await token_manager.get_token()
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{BASE}/{path}", params=params, headers={"Authorization": f"Bearer {token}"} if token else {})
        try:
            return r.status_code, r.json()
        except ValueError:
            return r.status_code, None


def n(x) -> str:
    return str(len(x)) if isinstance(x, list) else type(x).__name__


async def main() -> int:
    print("== 1. token")
    st = token_manager.status()
    print(f"   mode={st['mode']} configured={st['configured']}")
    if not token_manager.configured:
        print("   no OPENF1_USERNAME/OPENF1_PASSWORD — anonymous mode, nothing to check")
        return 0
    t0 = time.monotonic()
    token = await token_manager.get_token()
    st = token_manager.status()
    print(f"   obtained in {time.monotonic() - t0:.2f}s · length={len(token or '')} · lifetime={st['token_lifetime_s']}s · "
          f"expires_in={st['expires_in_s']}s · renews after {st['token_lifetime_s'] - RENEW_MARGIN_S}s")

    print("== 2. authenticated request through the client")
    async with httpx.AsyncClient(timeout=20) as c:
        rows = await openf1_client._get(c, "sessions", {"session_key": 9636})
    print(f"   GET /sessions?session_key=9636 → {len(rows)} row(s): {rows[0].get('session_name') if rows else '-'} "
          f"{rows[0].get('year') if rows else ''} · token requests so far: {token_manager.token_requests}")

    print("== 3. anonymous vs account")
    checks = [
        ("sessions", {"year": 2018}),
        ("sessions", {"year": 2022}),
        ("sessions", {"year": 2023, "session_type": "Race"}),
        ("meetings", {"year": 2020}),
        ("laps", {"session_key": 9636, "driver_number": 1, "lap_number": 10}),
        ("car_data", {"session_key": 9636, "driver_number": 1, "speed>=": 330}),
        ("location", {"session_key": 9636, "driver_number": 1, "date>": "2024-11-03T16:30:00", "date<": "2024-11-03T16:30:05"}),
        ("team_radio", {"session_key": 9636, "driver_number": 1}),
        ("race_control", {"session_key": 9636, "category": "SafetyCar"}),
        ("overtakes", {"session_key": 9636}),
        ("starting_grid", {"session_key": 9636}),
        ("session_result", {"session_key": 9636}),
        ("pit", {"session_key": 9636}),
    ]
    for path, params in checks:
        sa, ba = await anon(path, **params)
        su, bu = await auth(path, **params)
        print(f"   {path:16} {json.dumps(params)[:60]:60} anon={sa} {n(ba):>5}   account={su} {n(bu):>5}")

    print("== 4. stop_duration on older races (pit endpoint)")
    for year in (2023, 2024, 2025):
        s_anon, sess = await auth("sessions", year=year, session_type="Race")
        if not isinstance(sess, list) or not sess:
            print(f"   {year}: no race sessions ({s_anon})")
            continue
        for sk in [sess[0]["session_key"], sess[-1]["session_key"]]:
            _, pits = await auth("pit", session_key=sk)
            if isinstance(pits, list) and pits:
                with_sd = sum(1 for p in pits if p.get("stop_duration") is not None)
                keys = sorted(set().union(*(p.keys() for p in pits)))
                print(f"   {year} session {sk} ({next(x['meeting_key'] for x in sess if x['session_key']==sk)}): "
                      f"{len(pits)} stops, stop_duration present in {with_sd} · fields={keys}")
            else:
                print(f"   {year} session {sk}: pit → {n(pits)}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
