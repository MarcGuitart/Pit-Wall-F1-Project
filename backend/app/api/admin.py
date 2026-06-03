from fastapi import APIRouter

from app.core import cache

router = APIRouter(tags=["admin"])


@router.post("/admin/clear-cache/{session_key}")
async def clear_session_cache(session_key: int) -> dict:
    cache.clear(session_key)
    return {"cleared": True, "session_key": session_key}
