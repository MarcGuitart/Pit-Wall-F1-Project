"""Fetches the 9 OpenF1 endpoints for a session (see openf1_client.RACE_ENDPOINTS)."""
from app.clients.openf1_client import fetch_all


async def load_session(session_key: int, session_end: str | None = None) -> dict[str, list[dict]]:
    """
    Returns all raw endpoint data, fetching from OpenF1 or cache.
    `session_end` (session meta date_end) decides whether empty answers may be cached.
    """
    return await fetch_all(session_key, session_end)
