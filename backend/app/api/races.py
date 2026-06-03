import httpx
from fastapi import APIRouter, HTTPException, Query

from app.core.config import settings
from app.domain.models import RaceListItem, SessionInfo

router = APIRouter(tags=["races"])


@router.get("/races", response_model=list[RaceListItem])
async def list_races(year: int = Query(default=2024)) -> list[RaceListItem]:
    url = f"{settings.openf1_base_url}/meetings"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params={"year": year})
            resp.raise_for_status()
            meetings = resp.json()
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"OpenF1 unreachable: {exc}") from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail="OpenF1 error") from exc

    items: list[RaceListItem] = []
    for m in meetings:
        # Filter to race weekends only (exclude pre-season testing)
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

    return sorted(items, key=lambda x: x.date_start or "", reverse=True)


@router.get("/races/{meeting_key}/sessions", response_model=list[SessionInfo])
async def list_sessions(meeting_key: int) -> list[SessionInfo]:
    url = f"{settings.openf1_base_url}/sessions"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params={"meeting_key": meeting_key})
            resp.raise_for_status()
            sessions = resp.json()
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"OpenF1 unreachable: {exc}") from exc

    return [
        SessionInfo(
            session_key=s["session_key"],
            session_name=s.get("session_name", ""),
            session_type=s.get("session_type", ""),
            date_start=s.get("date_start"),
        )
        for s in sessions
    ]
