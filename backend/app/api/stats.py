"""
GET /stats — the landing's proof strip, from what this server has actually
published (Block 29). Public, not PRO: counts only, no race content.

Every figure is read from the published _analysis.json files (those present
when the server started, app.api.published_set: on Render, the analyses
versioned in the repo; one computed on demand afterwards changes nothing here)
written by the current pipeline (analysis_version == ANALYSIS_VERSION); an
older or unreadable file is not counted, because it is not what /analysis
would serve.

  sessions      how many such analyses exist
  driver_laps   Σ over those analyses, Σ over True Pace rows, of the driver's
                clean laps (sample_size) plus the laps the exclusion log
                removed ("N laps excluded: reason") — every lap of every
                driver the pace pipeline looked at
  seasons       the distinct race.year values among them
  modules       the analysis document's own fields (FullRaceAnalysis), minus
                its envelope (race, analysis_version, modules) — the registry
                the pipeline fills, not a number typed by hand

Cached in memory; recomputed when ANALYSIS_VERSION changes or any analysis
file's mtime or size does (a publication rewrites the file).
"""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from app.api import published_set
from app.core.config import settings
from app.core.version import ANALYSIS_VERSION
from app.domain.models import FullRaceAnalysis

logger = logging.getLogger(__name__)

router = APIRouter(tags=["stats"])

ENVELOPE = {"race", "analysis_version", "modules"}
EXCLUDED = re.compile(r"^\s*(\d+)\s+laps?\s+excluded\b", re.I)

DEFINITIONS = {
    "sessions": "Published analyses: the analyses versioned in the repo, built with the current pipeline.",
    "driver_laps": "Laps examined for True Pace, summed over every driver of every analysed session: the clean laps used plus the laps the exclusion log removed.",
    "seasons": "Seasons with at least one analysed session.",
    "modules": "Sections every analysis is built from, as the pipeline defines them.",
}


class Stats(BaseModel):
    sessions: int
    driver_laps: int
    seasons: list[int]
    modules: int
    module_names: list[str]
    analysis_version: str
    definitions: dict[str, str]


def module_names() -> list[str]:
    return sorted(name for name in FullRaceAnalysis.model_fields if name not in ENVELOPE)


def _excluded_laps(log: list) -> int:
    total = 0
    for line in log or []:
        m = EXCLUDED.match(line) if isinstance(line, str) else None
        if m:
            total += int(m.group(1))
    return total


def _analysis_files(root: Path) -> list[Path]:
    return published_set.files(root)


def _fingerprint(files: list[Path]) -> tuple:
    out = []
    for p in files:
        try:
            st = p.stat()
        except OSError:
            continue
        out.append((p.parent.name, st.st_mtime_ns, st.st_size))
    return (str(ANALYSIS_VERSION), tuple(out))


def compute(files: list[Path]) -> Stats:
    sessions = 0
    laps = 0
    seasons: set[int] = set()
    for p in files:
        try:
            doc = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(doc, dict) or str(doc.get("analysis_version")) != str(ANALYSIS_VERSION):
            continue
        sessions += 1
        year = (doc.get("race") or {}).get("year")
        if isinstance(year, int):
            seasons.add(year)
        for row in doc.get("true_pace") or []:
            if not isinstance(row, dict):
                continue
            n = row.get("sample_size")
            laps += (n if isinstance(n, int) else 0) + _excluded_laps(row.get("exclusion_log"))
    names = module_names()
    return Stats(
        sessions=sessions, driver_laps=laps, seasons=sorted(seasons), modules=len(names),
        module_names=names, analysis_version=str(ANALYSIS_VERSION), definitions=DEFINITIONS,
    )


_cached: tuple[tuple, Stats] | None = None


def _reset_for_tests() -> None:
    global _cached
    _cached = None
    published_set._reset_for_tests()


@router.get("/stats", response_model=Stats)
def stats() -> Stats:
    global _cached
    files = _analysis_files(settings.cache_path)
    key = (str(settings.cache_path), _fingerprint(files))
    if _cached is not None and _cached[0] == key:
        return _cached[1]
    result = compute(files)
    _cached = (key, result)
    logger.info("[STATS] recomputed: %d sessions, %d driver laps", result.sessions, result.driver_laps)
    return result
