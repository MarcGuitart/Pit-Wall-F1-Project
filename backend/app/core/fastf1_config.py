"""
FastF1 cache configuration.

Call configure_fastf1_cache() once before any fastf1 usage.
The cache directory lives at backend/fastf1_cache, resolved relative to this
file so it works regardless of the working directory uvicorn was launched from.

This module intentionally does NOT import fastf1 at module level — doing so
on Render's 512 MB free-tier container OOMs the process before any route
handler is registered, causing all /telemetry/* requests to return 503.
"""
from pathlib import Path

# core/ -> app/ -> backend/
_FASTF1_CACHE_DIR = Path(__file__).resolve().parents[2] / "fastf1_cache"


def configure_fastf1_cache() -> None:
    """Import fastf1 and enable its on-disk cache. Call once before session.load()."""
    import fastf1  # noqa: PLC0415 — lazy import, must not be at module level

    _FASTF1_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    fastf1.Cache.enable_cache(str(_FASTF1_CACHE_DIR))
