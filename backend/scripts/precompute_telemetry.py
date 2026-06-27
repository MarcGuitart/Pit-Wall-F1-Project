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

# Ensure the backend package is importable regardless of working directory
sys.path.insert(0, str(Path(__file__).parent.parent))

# Configure FastF1 cache before any imports that touch fastf1
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


def get_processable_sessions(cache_dir: Path) -> list[dict]:
    """
    Return session dicts for every cached session that has enough metadata
    (either _analysis.json or _session_meta.json) to call load_telemetry().
    Sessions without metadata are silently skipped — they can't be computed.
    """
    sessions = []
    for path in sorted(cache_dir.iterdir()):
        if not path.is_dir():
            continue
        if not (path / "laps.json").exists():
            continue

        meta: dict | None = None

        # Prefer _analysis.json — it has exactly the fields the endpoint uses
        analysis_file = path / "_analysis.json"
        if analysis_file.exists():
            try:
                data = json.loads(analysis_file.read_text())
                race = data.get("race", {})
                meta = {
                    "session_key": race.get("session_key", int(path.name)),
                    "year": race["year"],
                    "circuit_name": race.get("circuit_short_name") or race["meeting_name"],
                    "session_type": race["session_name"],
                    "display": f"{race['meeting_name']} {race['year']} {race['session_name']}",
                }
            except (KeyError, json.JSONDecodeError):
                pass

        # Fall back to _session_meta.json
        if meta is None:
            meta_file = path / "_session_meta.json"
            if meta_file.exists():
                try:
                    sm = json.loads(meta_file.read_text())
                    meta = {
                        "session_key": sm.get("session_key", int(path.name)),
                        "year": sm["year"],
                        "circuit_name": sm.get("circuit_short_name") or sm["meeting_name"],
                        "session_type": sm.get("session_name") or sm.get("session_type", "Race"),
                        "display": f"{sm['meeting_name']} {sm['year']} {sm.get('session_name','Race')}",
                    }
                except (KeyError, json.JSONDecodeError):
                    pass

        if meta is None:
            logger.debug("SKIP %s — no metadata source found", path.name)
            continue

        sessions.append(meta)

    return sessions


async def compute_and_cache(
    session_key: int,
    year: int,
    circuit_name: str,
    session_type: str,
    driver_codes: list[str],
    lap_mode: str,
    cache_dir: Path,
    force: bool,
) -> bool:
    """Compute telemetry via load_telemetry() and write to the cache file."""
    from app.services.telemetry_service import load_telemetry
    from app.core import cache as cache_module

    sorted_drivers = "_".join(sorted(driver_codes))
    cache_key = f"telemetry_{lap_mode}_{sorted_drivers}"
    out_path = cache_dir / str(session_key) / f"{cache_key}.json"

    if out_path.exists() and not force:
        logger.info("  SKIP %s %s — already cached (%s)", session_key, lap_mode, out_path.name)
        return True

    logger.info("  COMPUTE %s %s (%s)…", session_key, lap_mode, ", ".join(driver_codes))
    try:
        tel_data = await load_telemetry(
            year=year,
            circuit_name=circuit_name,
            session_type=session_type,
            driver_codes=driver_codes,
            lap_mode=lap_mode,
        )
    except Exception as exc:
        logger.warning("  FAILED %s %s: %s", session_key, lap_mode, exc)
        return False

    if tel_data is None:
        logger.warning("  FAILED %s %s: load_telemetry returned None", session_key, lap_mode)
        return False

    # Write via cache.set() so the endpoint can read it via cache.get()
    cache_module.set(session_key, cache_key, tel_data.model_dump())
    size_kb = out_path.stat().st_size / 1024
    logger.info("  SAVED  %s → %s (%.0f KB)", session_key, out_path.name, size_kb)
    return True


async def main_async(args: argparse.Namespace) -> None:
    import fastf1
    fastf1.Cache.enable_cache(FASTF1_CACHE)

    cache_dir = _get_cache_dir()
    driver_codes = [d.strip().upper() for d in args.drivers.split(",") if d.strip()]

    all_sessions = get_processable_sessions(cache_dir)
    if args.sessions.strip().lower() == "all":
        sessions = all_sessions
    else:
        requested = {s.strip() for s in args.sessions.split(",")}
        sessions = [s for s in all_sessions if str(s["session_key"]) in requested]
        # Warn about any requested key that has no metadata
        found_keys = {str(s["session_key"]) for s in sessions}
        for key in requested - found_keys:
            logger.warning("Session %s not found or has no metadata — skipping", key)

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
                circuit_name=session["circuit_name"],
                session_type=session["session_type"],
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
