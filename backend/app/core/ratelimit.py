"""
In-memory sliding-window rate limiting.

Single Render instance, no Redis: a per-process dict of timestamps per key is
enough. Two flavours share the window bookkeeping:
- SlidingWindow.retry_after(key)  — non-blocking, for request limits (429)
- BlockingLimiter.acquire()       — waits, for outgoing OpenF1 calls
"""
from __future__ import annotations

import asyncio
import time
from collections import deque


class SlidingWindow:
    """At most `limit` hits per `window` seconds, per key."""

    def __init__(self, limit: int, window: float, clock=time.monotonic) -> None:
        self.limit = limit
        self.window = window
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}

    def _prune(self, key: str, now: float) -> deque[float]:
        hits = self._hits.setdefault(key, deque())
        while hits and now - hits[0] >= self.window:
            hits.popleft()
        if not hits:
            self._hits.pop(key, None)
            hits = self._hits.setdefault(key, deque())
        return hits

    def retry_after(self, key: str) -> float:
        """Seconds until the next hit would be allowed; 0.0 if it is allowed now."""
        now = self._clock()
        hits = self._prune(key, now)
        if len(hits) < self.limit:
            return 0.0
        return max(0.0, hits[0] + self.window - now)

    def hit(self, key: str) -> None:
        self._prune(key, self._clock()).append(self._clock())

    def reset(self) -> None:
        self._hits.clear()


class BlockingLimiter:
    """Blocks until a hit is allowed. Single key — used for the OpenF1 client."""

    def __init__(self, limit: int, window: float) -> None:
        self._window = SlidingWindow(limit, window)
        self._lock = asyncio.Lock()

    @property
    def limit(self) -> int:
        return self._window.limit

    @property
    def window(self) -> float:
        return self._window.window

    async def acquire(self) -> None:
        async with self._lock:
            while True:
                wait = self._window.retry_after("*")
                if wait <= 0:
                    self._window.hit("*")
                    return
                await asyncio.sleep(wait)
