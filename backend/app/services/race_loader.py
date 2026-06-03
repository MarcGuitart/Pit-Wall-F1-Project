"""Fetches all 8 OpenF1 endpoints for a session and joins driver metadata."""
from app.clients.openf1_client import fetch_all


async def load_session(session_key: int) -> dict[str, list[dict]]:
    """Returns all raw endpoint data, fetching from OpenF1 or cache."""
    return await fetch_all(session_key)
