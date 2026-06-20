"""
FastF1 cache configuration.

Importing this module enables FastF1's on-disk cache. The cache directory
lives at backend/fastf1_cache (resolved relative to this file so it works
regardless of the working directory uvicorn was launched from).
"""
from pathlib import Path

import fastf1

# core/ -> app/ -> backend/
FASTF1_CACHE_DIR = Path(__file__).resolve().parents[2] / "fastf1_cache"
FASTF1_CACHE_DIR.mkdir(parents=True, exist_ok=True)

fastf1.Cache.enable_cache(str(FASTF1_CACHE_DIR))
