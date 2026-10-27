"""
Which analyses count as published: the _analysis.json files present when the
server started.

On Render the API has no disk, so what is there at boot is exactly what the
built commit carries in backend/cache: the analyses versioned in the repo. An
analysis computed on demand afterwards is written to the same directory and is
served by /analysis, but it is not a publication, so /published and /stats
leave it out. A new deploy (a new boot) is what publishes.

The snapshot is taken once per cache root: at startup for settings.cache_path
(app.main), or on first use for a root seen later (tests point cache_dir at a
temporary directory). It holds session keys only; whether a listed file is
still there, and what it says, is read when a figure is computed.
"""
from __future__ import annotations

import logging
import threading
from pathlib import Path

logger = logging.getLogger(__name__)

ANALYSIS_FILE = "_analysis.json"

_lock = threading.Lock()
_snapshots: dict[Path, frozenset[str]] = {}


def _scan(root: Path) -> frozenset[str]:
    if not root.is_dir():
        return frozenset()
    return frozenset(d.name for d in root.iterdir()
                     if d.is_dir() and d.name.isdigit() and (d / ANALYSIS_FILE).is_file())


def keys(root: Path) -> frozenset[str]:
    """Session directory names under `root` that had an analysis when it was first seen."""
    with _lock:
        snap = _snapshots.get(root)
        if snap is None:
            snap = _snapshots[root] = _scan(root)
            logger.info("[PUBLISHED] snapshot of %s: %d analyses present at boot", root, len(snap))
        return snap


def files(root: Path) -> list[Path]:
    """The snapshot's analysis files that still exist, sorted by session key."""
    out = [root / k / ANALYSIS_FILE for k in keys(root)]
    return sorted((p for p in out if p.is_file()), key=lambda p: int(p.parent.name))


def _reset_for_tests() -> None:
    with _lock:
        _snapshots.clear()
