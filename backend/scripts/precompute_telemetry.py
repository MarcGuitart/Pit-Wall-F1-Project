#!/usr/bin/env python3
"""
Precompute FastF1 telemetry JSON for all locally cached F1 sessions.

Run via GitHub Actions or locally:
  python scripts/precompute_telemetry.py --sessions 9636,9539 --drivers VER,NOR,LEC
  python scripts/precompute_telemetry.py --sessions all --force

Output files land at:
  backend/cache/{session_key}/telemetry_{lap_mode}_{sorted_drivers}.json

These paths are exactly what the telemetry endpoint reads via cache.get(), so
Render serves the static JSON with zero FastF1 memory pressure.
"""

import argparse
import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from typing import Optional

# Ensure the backend package is importable regardless of working directory
sys.path.insert(0, str(Path(__file__).parent.parent))

# FastF1 cache path — set before any fastf1 import
FASTF1_CACHE = os.getenv("FASTF1_CACHE", str(Path.home() / ".cache" / "fastf1"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

LAP_MODES = ["fastest_clean", "representative"]


def _get_cache_dir() -> Path:
    from app.core.config import settings
    return settings.cache_path


# ── Session metadata discovery ─────────────────────────────────────────────

def get_processable_sessions(cache_dir: Path) -> list[dict]:
    """
    Return one dict per cached session that has enough metadata to call FastF1.
    Requires either _analysis.json or _session_meta.json plus a laps.json.
    Sessions missing both metadata sources are silently skipped.
    """
    sessions = []
    for path in sorted(cache_dir.iterdir()):
        if not path.is_dir() or not (path / "laps.json").exists():
            continue

        meta: dict | None = None

        # _analysis.json is preferred — its race.* fields are the canonical source
        analysis_file = path / "_analysis.json"
        if analysis_file.exists():
            try:
                data = json.loads(analysis_file.read_text())
                race = data["race"]
                meta = {
                    "session_key": race.get("session_key", int(path.name)),
                    "year": race["year"],
                    "meeting_name": race["meeting_name"],
                    "session_name": race["session_name"],
                    "display": f"{race['meeting_name']} {race['year']} · {race['session_name']}",
                }
            except (KeyError, json.JSONDecodeError) as exc:
                logger.debug("Could not parse _analysis.json for %s: %s", path.name, exc)

        # Fall back to _session_meta.json
        if meta is None:
            meta_file = path / "_session_meta.json"
            if meta_file.exists():
                try:
                    sm = json.loads(meta_file.read_text())
                    meta = {
                        "session_key": sm.get("session_key", int(path.name)),
                        "year": sm["year"],
                        "meeting_name": sm["meeting_name"],
                        "session_name": sm.get("session_name") or sm.get("session_type", "Race"),
                        "display": (
                            f"{sm['meeting_name']} {sm['year']} · "
                            f"{sm.get('session_name') or sm.get('session_type','Race')}"
                        ),
                    }
                except (KeyError, json.JSONDecodeError) as exc:
                    logger.debug("Could not parse _session_meta.json for %s: %s", path.name, exc)

        if meta is None:
            logger.debug("SKIP %s — no usable metadata found", path.name)
            continue

        sessions.append(meta)

    return sessions


# ── FastF1 helpers (synchronous — run in executor) ─────────────────────────

def _load_ff1_session(year: int, meeting_name: str, session_name: str):
    """
    Load a FastF1 session using the exact strings from our metadata files.
    FastF1's fuzzy gp matching handles "Abu Dhabi Grand Prix", "São Paulo Grand Prix", etc.
    Using meeting_name directly avoids the CIRCUIT_NAME_MAP used by the runtime
    endpoint (which can miss entries like "Yas Marina Circuit").
    """
    from app.core.fastf1_config import configure_fastf1_cache
    configure_fastf1_cache()
    import fastf1

    fastf1.Cache.enable_cache(FASTF1_CACHE)
    session = fastf1.get_session(year, meeting_name, session_name)
    session.load(telemetry=True, laps=True, weather=False)
    return session


# ── Per-session computation ────────────────────────────────────────────────

async def compute_and_cache(
    session_key: int,
    year: int,
    meeting_name: str,
    session_name: str,
    driver_codes: list[str],
    lap_mode: str,
    cache_dir: Path,
    force: bool,
) -> bool:
    """
    Compute FastF1 telemetry for one session + lap_mode combination and write
    the result to the cache file the telemetry endpoint reads at request time.
    Returns True on success, False on any failure (error is logged, not raised).
    """
    from app.core import cache as cache_module
    from app.domain.models import TelemetryData
    from app.services.telemetry_service import (
        SESSION_TYPE_MAP,
        _compute_sector_boundaries,
        _extract_circuit_outline,
        _extract_driver_telemetry,
    )

    sorted_drivers = "_".join(sorted(driver_codes))
    cache_key = f"telemetry_{lap_mode}_{sorted_drivers}"
    out_path = cache_dir / str(session_key) / f"{cache_key}.json"

    if out_path.exists() and not force:
        logger.info("  SKIP %s [%s] — already cached", session_key, lap_mode)
        return True

    loop = asyncio.get_event_loop()

    # Step 1 — load FastF1 session
    logger.info(
        "  LOAD  %s [%s] via FastF1: %s %s · %s",
        session_key, lap_mode, year, meeting_name, session_name,
    )
    try:
        session = await loop.run_in_executor(
            None, _load_ff1_session, year, meeting_name, session_name
        )
    except Exception as exc:
        logger.warning("  FAILED %s [%s] session load: %s", session_key, lap_mode, exc)
        return False

    # Step 2 — extract per-driver telemetry
    # SESSION_TYPE_MAP: "Race" → "R", "Qualifying" → "Q", etc.
    f1_session_type = SESSION_TYPE_MAP.get(session_name, "R")

    drivers_data = []
    reference_tel = None

    for code in driver_codes:
        try:
            drv_tel = await loop.run_in_executor(
                None, _extract_driver_telemetry, session, code, f1_session_type, lap_mode
            )
            if drv_tel and drv_tel.points:
                drivers_data.append(drv_tel)
                if reference_tel is None:
                    reference_tel = drv_tel
                logger.info("    ✓ %s", code)
            else:
                logger.info("    – %s (no telemetry points)", code)
        except Exception as exc:
            logger.warning("    ✗ %s: %s", code, exc)
            continue

    if not drivers_data or reference_tel is None:
        logger.warning("  FAILED %s [%s]: no driver telemetry extracted", session_key, lap_mode)
        return False

    # Step 3 — assemble TelemetryData and write to cache
    circuit_outline = _extract_circuit_outline(reference_tel.points)
    sector_boundaries = _compute_sector_boundaries(reference_tel)

    tel_data = TelemetryData(
        circuit_key=f"{meeting_name.lower().replace(' ', '_')}_{year}",
        circuit_name=meeting_name,
        year=year,
        session_type=session_name,
        circuit_outline=circuit_outline,
        drivers=drivers_data,
        sector_boundaries=sector_boundaries,
        total_distance=reference_tel.points[-1].distance if reference_tel.points else 0,
        confidence="High",
        source="FastF1",
    )

    cache_module.set(session_key, cache_key, tel_data.model_dump())
    size_kb = out_path.stat().st_size / 1024
    logger.info("  SAVED  %s → %s (%.0f KB)", session_key, out_path.name, size_kb)
    return True


# ── Entry point ────────────────────────────────────────────────────────────

async def main_async(args: argparse.Namespace) -> None:
    cache_dir = _get_cache_dir()
    driver_codes = [d.strip().upper() for d in args.drivers.split(",") if d.strip()]

    all_sessions = get_processable_sessions(cache_dir)

    if args.sessions.strip().lower() == "all":
        sessions = all_sessions
    else:
        requested = {s.strip() for s in args.sessions.split(",")}
        sessions = [s for s in all_sessions if str(s["session_key"]) in requested]
        found_keys = {str(s["session_key"]) for s in sessions}
        for key in requested - found_keys:
            logger.warning("Session %s has no processable metadata — skipping", key)

    if not sessions:
        logger.error("No processable sessions found. Exiting.")
        sys.exit(1)

    logger.info("Sessions to process: %s", [s["session_key"] for s in sessions])
    logger.info("Drivers: %s", driver_codes)
    logger.info("Lap modes: %s", LAP_MODES)
    logger.info("Force recompute: %s", args.force)
    print()

    total_ok = 0
    total_fail = 0

    for session in sessions:
        sk = session["session_key"]
        logger.info("[%s] %s", sk, session["display"])
        for lap_mode in LAP_MODES:
            ok = await compute_and_cache(
                session_key=sk,
                year=session["year"],
                meeting_name=session["meeting_name"],
                session_name=session["session_name"],
                driver_codes=driver_codes,
                lap_mode=lap_mode,
                cache_dir=cache_dir,
                force=args.force,
            )
            if ok:
                total_ok += 1
            else:
                total_fail += 1
        print()

    logger.info("Done. %d succeeded, %d failed.", total_ok, total_fail)
    if total_fail > 0:
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Precompute FastF1 telemetry for cached sessions."
    )
    parser.add_argument(
        "--sessions",
        default="all",
        help='Comma-separated session keys or "all" (default: all)',
    )
    parser.add_argument(
        "--drivers",
        default="VER,NOR,PIA,LEC,RUS",
        help="Comma-separated driver codes (default: VER,NOR,PIA,LEC,RUS)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Recompute even if a cache file already exists",
    )
    args = parser.parse_args()

    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
