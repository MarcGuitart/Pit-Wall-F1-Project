import httpx
from fastapi import APIRouter, HTTPException, Query

from app.core.config import settings
from app.core import cache as race_cache
from app.domain.models import RaceListItem, SessionInfo

router = APIRouter(tags=["races"])


@router.get("/races", response_model=list[RaceListItem])
async def list_races(year: int = Query(default=2024)) -> list[RaceListItem]:
    # Fast path: serve any cached season list immediately. This keeps the UI
    # stable when OpenF1 has a transient failure and avoids hard-coded season
    # cutoffs becoming stale.
    cached = race_cache.get_meetings(year)
    if cached:
        return cached  # already sorted list[RaceListItem] dicts

    url = f"{settings.openf1_base_url}/meetings"
    token = settings.openf1_api_token
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params={"year": year}, headers=headers)
            resp.raise_for_status()
            meetings = resp.json()
    except httpx.RequestError as exc:
        cached = race_cache.get_meetings(year)
        if cached:
            return cached
        raise HTTPException(status_code=503, detail=f"OpenF1 unreachable: {exc}") from exc
    except httpx.HTTPStatusError as exc:
        cached = race_cache.get_meetings(year)
        if cached:
            return cached
        raise HTTPException(status_code=exc.response.status_code, detail="OpenF1 error") from exc

    items: list[RaceListItem] = []
    for m in meetings:
        if not m.get("meeting_name"):
            continue
        items.append(
            RaceListItem(
                meeting_key=m["meeting_key"],
                meeting_name=m.get("meeting_name", ""),
                country_name=m.get("country_name"),
                circuit_short_name=m.get("circuit_short_name"),
                date_start=m.get("date_start"),
                year=m.get("year", year),
            )
        )

    sorted_items = sorted(items, key=lambda x: x.date_start or "", reverse=True)

    # Persist successful results for future calls.
    if sorted_items:
        race_cache.set_meetings(year, [i.model_dump() for i in sorted_items])

    return sorted_items


@router.get("/races/{meeting_key}/sessions", response_model=list[SessionInfo])
async def list_sessions(meeting_key: int) -> list[SessionInfo]:
    cached = race_cache.get_sessions_for_meeting(meeting_key)
    if cached:
        return cached

    url = f"{settings.openf1_base_url}/sessions"
    token = settings.openf1_api_token
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params={"meeting_key": meeting_key}, headers=headers)
            if resp.status_code == 401:
                raise HTTPException(
                    status_code=404,
                    detail="Session list not in cache and OpenF1 requires authentication. Set OPENF1_API_TOKEN.",
                )
            resp.raise_for_status()
            sessions = resp.json()
    except HTTPException:
        raise
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"OpenF1 unreachable: {exc}") from exc

    result = [
        SessionInfo(
            session_key=s["session_key"],
            session_name=s.get("session_name", ""),
            session_type=s.get("session_type", ""),
            date_start=s.get("date_start"),
        )
        for s in sessions
    ]

    if result:
        race_cache.set_sessions_for_meeting(meeting_key, [s.model_dump() for s in result])

    return result
