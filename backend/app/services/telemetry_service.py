"""
Circuit Telemetry service — FastF1 backed.

FastF1 is a synchronous library; all of its blocking calls are run in a
thread-pool executor so the FastAPI event loop is never blocked.

This service is independent of the OpenF1 analysis pipeline. It only needs
year / circuit name / session type to locate a FastF1 session.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

from app.core import cache
from app.core.config import settings
from app.domain.models import (
    TelemetryData, DriverTelemetry, TelemetryPoint, CircuitPoint,
)

logger = logging.getLogger(__name__)


# OpenF1 circuit_short_name / meeting_name → FastF1 event name
CIRCUIT_NAME_MAP = {
    "Interlagos": "São Paulo",
    "Sakhir": "Bahrain",
    "Catalunya": "Spain",
    "Monte Carlo": "Monaco",
    "Silverstone": "Great Britain",
    "Hungaroring": "Hungary",
    "Spielberg": "Austria",
    "Zandvoort": "Netherlands",
    "Monza": "Italy",
    "Baku": "Azerbaijan",
    "Marina Bay": "Singapore",
    "Yas Marina": "Abu Dhabi",
    "Mexico City": "Mexico City",
    "Austin": "United States",
    "Las Vegas": "Las Vegas",
    "Lusail": "Qatar",
    "Shanghai": "China",
    "Suzuka": "Japan",
    "Melbourne": "Australia",
    "Jeddah": "Saudi Arabia",
    "Montreal": "Canada",
    "Miami": "Miami",
    "Imola": "Emilia Romagna",
    "Spa": "Belgium",
}

SESSION_TYPE_MAP = {
    "Race": "R",
    "Qualifying": "Q",
    "Sprint": "Sprint",
    "Sprint Qualifying": "Sprint Qualifying",
    "Practice 1": "FP1",
    "Practice 2": "FP2",
    "Practice 3": "FP3",
}

DOWNSAMPLE_TO = 300  # points per driver per lap
CIRCUIT_OUTLINE_POINTS = 400  # reference outline resolution
RACE_TRACE_POINTS = 1400


def _notna(value) -> bool:
    if value is None:
        return False
    try:
        return bool(value == value)
    except Exception:
        return True


def _parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _driver_maps(drivers_data: list[dict]) -> tuple[dict[str, dict], dict[int, dict]]:
    by_code: dict[str, dict] = {}
    by_number: dict[int, dict] = {}
    for driver in drivers_data:
        code = driver.get("name_acronym")
        number = driver.get("driver_number")
        if code:
            by_code[str(code).upper()] = driver
        if number is not None:
            by_number[int(number)] = driver
    return by_code, by_number


def _lap_windows(laps_data: list[dict]) -> dict[int, list[tuple[datetime, datetime, int]]]:
    windows: dict[int, list[tuple[datetime, datetime, int]]] = {}
    for lap in laps_data:
        start = _parse_ts(lap.get("date_start"))
        duration = lap.get("lap_duration")
        driver_number = lap.get("driver_number")
        lap_number = lap.get("lap_number")
        if not start or not duration or driver_number is None or lap_number is None:
            continue
        end = start + timedelta(seconds=float(duration))
        windows.setdefault(int(driver_number), []).append((start, end, int(lap_number)))

    for driver_windows in windows.values():
        driver_windows.sort(key=lambda item: item[0])
    return windows


def _find_lap_number(
    windows: list[tuple[datetime, datetime, int]],
    timestamp: datetime,
    cursor: int,
) -> tuple[int | None, int]:
    while cursor + 1 < len(windows) and timestamp >= windows[cursor][1]:
        cursor += 1
    if windows and windows[cursor][0] <= timestamp <= windows[cursor][1]:
        return windows[cursor][2], cursor
    return None, cursor


def _downsample(points: list[TelemetryPoint], limit: int) -> list[TelemetryPoint]:
    if len(points) <= limit:
        return points
    step = len(points) / limit
    return [points[int(i * step)] for i in range(limit)]


async def _fetch_car_data(session_key: int, driver_number: int) -> list[dict]:
    endpoint = f"car_data_{driver_number}"
    cached = cache.get(session_key, endpoint)
    if cached is not None:
        return cached

    async with httpx.AsyncClient(timeout=45.0) as client:
        resp = await client.get(
            f"{settings.openf1_base_url}/car_data",
            params={"session_key": session_key, "driver_number": driver_number},
        )
        resp.raise_for_status()
        data = resp.json()
        cache.set(session_key, endpoint, data)
        return data


async def load_openf1_race_telemetry(
    session_key: int,
    race: dict,
    laps_data: list[dict],
    drivers_data: list[dict],
    driver_codes: list[str],
) -> Optional[TelemetryData]:
    by_code, _ = _driver_maps(drivers_data)
    lap_windows = _lap_windows(laps_data)
    if not by_code or not lap_windows:
        return None

    race_starts = [w[0][0] for w in lap_windows.values() if w]
    race_ends = [w[-1][1] for w in lap_windows.values() if w]
    if not race_starts or not race_ends:
        return None

    race_start = min(race_starts)
    race_end = max(race_ends)
    total_seconds = max(1.0, (race_end - race_start).total_seconds())
    drivers: list[DriverTelemetry] = []

    for code in driver_codes[:5]:
        meta = by_code.get(code.upper())
        if not meta:
            continue
        driver_number = int(meta["driver_number"])
        windows = lap_windows.get(driver_number, [])
        if not windows:
            continue

        try:
            raw = await _fetch_car_data(session_key, driver_number)
        except Exception as exc:
            logger.warning("[TELEMETRY] OpenF1 car_data failed for %s/%s: %s", session_key, code, exc)
            continue

        points: list[TelemetryPoint] = []
        cursor = 0
        for row in raw:
            timestamp = _parse_ts(row.get("date"))
            if not timestamp or timestamp < race_start or timestamp > race_end:
                continue
            lap_number, cursor = _find_lap_number(windows, timestamp, cursor)
            if lap_number is None:
                continue
            race_time = (timestamp - race_start).total_seconds()
            brake_value = row.get("brake") or 0
            points.append(
                TelemetryPoint(
                    distance=race_time,
                    race_time=race_time,
                    lap_number=lap_number,
                    x=0.0,
                    y=0.0,
                    speed=float(row.get("speed") or 0),
                    throttle=float(row.get("throttle") or 0),
                    brake=bool(brake_value),
                    gear=int(row.get("n_gear") or 0),
                    drs=int(row.get("drs") or 0),
                )
            )

        points = _downsample(points, RACE_TRACE_POINTS)
        if not points:
            continue

        colour = "#" + str(meta.get("team_colour") or "FFFFFF").lstrip("#")
        drivers.append(
            DriverTelemetry(
                driver_code=code.upper(),
                team_colour=colour,
                lap_time=0.0,
                fastest_lap_number=0,
                points=points,
            )
        )

    if not drivers:
        return None

    return TelemetryData(
        circuit_key=f"{str(race.get('circuit_short_name') or race.get('meeting_name') or 'race').lower().replace(' ', '_')}_{race.get('year')}",
        circuit_name=race.get("circuit_short_name") or race.get("meeting_name") or "Race",
        year=int(race.get("year") or 0),
        session_type=race.get("session_name") or "Race",
        circuit_outline=[],
        drivers=drivers,
        sector_boundaries={
            "sector_1_end": total_seconds / 3,
            "sector_2_end": total_seconds * 2 / 3,
        },
        total_distance=total_seconds,
        confidence="Medium",
        source="OpenF1 car_data",
        note="Full-race input traces from OpenF1 car_data. X-axis is race time, not lap distance.",
    )


# ── Synchronous FastF1 helpers (run in executor) ───────────────────────────

def _load_fastf1_session(year: int, circuit: str, session_type: str):
    """Synchronous FastF1 load — run in executor."""
    # Importing fastf1_config enables the on-disk cache as a side effect.
    from app.core import fastf1_config  # noqa: F401
    import fastf1 as ff1

    session = ff1.get_session(year, circuit, session_type)
    session.load(telemetry=True, laps=True, weather=False)
    return session


def _normalise_xy(x_vals, y_vals) -> tuple[list[float], list[float]]:
    cx, cy = x_vals.mean(), y_vals.mean()
    scale = max(x_vals.max() - x_vals.min(), y_vals.max() - y_vals.min()) / 2
    if scale == 0:
        scale = 1
    norm_x = ((x_vals - cx) / scale).tolist()
    norm_y = ((y_vals - cy) / scale).tolist()
    return norm_x, norm_y


def _compute_gg(x_m, y_m, speed_kmh, distance_m=None):
    """
    Compute lateral and longitudinal G-forces using arc-length parameterization.

    Parameterizing by arc length (real meters along track) gives accurate curvature
    and avoids numerical errors from non-uniform time-based sampling.

    lat_g: centripetal  = v² × κ / g  (κ = signed curvature in 1/m)
    lon_g: longitudinal = (dv/ds) × v / g  (s = arc length in m)

    Returns two lists of floats, same length as inputs, clipped to ±5g.
    """
    import numpy as np

    n = len(speed_kmh)
    if n < 6:
        return [0.0] * n, [0.0] * n

    x = np.asarray(x_m, dtype=float)
    y = np.asarray(y_m, dtype=float)
    v = np.asarray(speed_kmh, dtype=float) / 3.6  # m/s

    # Arc-length parameterization — avoids distortion from varying sample density
    if distance_m is not None:
        d = np.asarray(distance_m, dtype=float)
        d = np.maximum.accumulate(d)  # ensure monotonically non-decreasing
    else:
        ds_raw = np.sqrt(np.diff(x) ** 2 + np.diff(y) ** 2)
        d = np.concatenate([[0.0], np.cumsum(np.where(ds_raw < 0.01, 0.01, ds_raw))])

    # Guarantee strict monotonicity so np.gradient never divides by zero
    for i in range(1, len(d)):
        if d[i] <= d[i - 1]:
            d[i] = d[i - 1] + 0.01

    # Longitudinal G: a_lon = (dv/ds) × v / g
    dvds = np.gradient(v, d)
    lon_g = dvds * v / 9.81

    # Lateral G: a_lat = v² × κ / g (signed curvature via arc-length derivatives)
    dxds = np.gradient(x, d)   # unit tangent x-component (dimensionless)
    dyds = np.gradient(y, d)   # unit tangent y-component (dimensionless)
    d2xds2 = np.gradient(dxds, d)  # curvature x-component (1/m)
    d2yds2 = np.gradient(dyds, d)  # curvature y-component (1/m)

    cross = dxds * d2yds2 - dyds * d2xds2          # signed curvature (1/m)
    denom = (dxds ** 2 + dyds ** 2) ** 1.5
    denom = np.where(np.abs(denom) < 1e-12, 1e-12, denom)
    curvature = cross / denom  # 1/m, positive = left turn

    lat_g = v ** 2 * curvature / 9.81

    # 9-point box filter to remove GPS noise without destroying corner peaks
    def _smooth(arr: np.ndarray, k: int = 9) -> np.ndarray:
        kernel = np.ones(k) / k
        return np.convolve(arr, kernel, mode="same")

    lat_g = _smooth(lat_g)
    lon_g = _smooth(lon_g)

    # Clip to F1 physical limits (~5g peak braking, ~5g lateral)
    lat_g = np.clip(lat_g, -5.0, 5.0)
    lon_g = np.clip(lon_g, -5.0, 5.0)

    return [round(float(v), 3) for v in lat_g], [round(float(v), 3) for v in lon_g]


def _pick_lap(laps, lap_mode: str):
    """Pick a lap based on mode: fastest_clean or representative (closest to median)."""
    clean = laps[~laps["PitInTime"].notna() & ~laps["PitOutTime"].notna()]
    pool = clean if not clean.empty else laps

    if lap_mode == "representative":
        valid = pool.dropna(subset=["LapTime"])
        if valid.empty:
            return pool.pick_fastest()
        median_time = valid["LapTime"].median()
        idx = (valid["LapTime"] - median_time).abs().idxmin()
        return valid.loc[idx]

    # Default: fastest_clean
    return pool.pick_fastest()


def _extract_driver_telemetry(
    session, driver_code, session_type, lap_mode: str = "fastest_clean"
) -> Optional[DriverTelemetry]:
    """Extract and downsample telemetry for one driver's chosen lap."""
    laps = session.laps.pick_driver(driver_code)
    if laps.empty:
        return None

    if session_type == "R":
        fastest = _pick_lap(laps, lap_mode)
    else:
        fastest = laps.pick_fastest()

    if fastest is None or (hasattr(fastest, "empty") and fastest.empty):
        return None

    tel = fastest.get_telemetry()
    if tel is None or tel.empty:
        return None

    x_vals = tel["X"].values
    y_vals = tel["Y"].values
    norm_x, norm_y = _normalise_xy(x_vals, y_vals)

    # Compute G-forces using arc-length parameterization for accuracy
    dist_vals = tel["Distance"].values
    lat_g_full, lon_g_full = _compute_gg(
        x_vals.tolist(), y_vals.tolist(), tel["Speed"].tolist(), dist_vals.tolist()
    )

    total = len(tel)
    step = max(1, total // DOWNSAMPLE_TO)
    indices = list(range(0, total, step))

    points = [
        TelemetryPoint(
            distance=float(tel.iloc[i]["Distance"]),
            x=norm_x[i],
            y=norm_y[i],
            speed=float(tel.iloc[i]["Speed"]),
            throttle=float(tel.iloc[i]["Throttle"]),
            brake=bool(tel.iloc[i]["Brake"]),
            gear=int(tel.iloc[i]["nGear"]),
            drs=int(tel.iloc[i].get("DRS", 0) or 0),
            lat_g=lat_g_full[i],
            lon_g=lon_g_full[i],
        )
        for i in indices
    ]

    # Team colour from FastF1 (returns hex without '#')
    try:
        raw = session.get_driver(driver_code)["TeamColor"]
        team_colour = "#" + str(raw).lstrip("#")
    except Exception:
        team_colour = "#FFFFFF"

    def _secs(val):
        return float(val.total_seconds()) if _notna(val) else None

    return DriverTelemetry(
        driver_code=driver_code,
        team_colour=team_colour,
        lap_time=float(fastest["LapTime"].total_seconds()) if _notna(fastest["LapTime"]) else 0.0,
        fastest_lap_number=int(fastest["LapNumber"]) if _notna(fastest["LapNumber"]) else 0,
        lap_mode=lap_mode,
        points=points,
        sector_1_time=_secs(fastest["Sector1Time"]),
        sector_2_time=_secs(fastest["Sector2Time"]),
        sector_3_time=_secs(fastest["Sector3Time"]),
    )


def _extract_circuit_outline(points: list[TelemetryPoint]) -> list[CircuitPoint]:
    """Use a driver's normalised line as the circuit reference outline."""
    if not points:
        return []
    # Cap outline resolution; reuse the already-downsampled driver points.
    step = max(1, len(points) // CIRCUIT_OUTLINE_POINTS)
    return [
        CircuitPoint(x=p.x, y=p.y, distance=p.distance)
        for p in points[::step]
    ]


def _compute_sector_boundaries(driver_tel: DriverTelemetry) -> dict:
    """Approximate sector boundary distances from sector times."""
    total = driver_tel.points[-1].distance if driver_tel.points else 0
    s1 = driver_tel.sector_1_time
    s2 = driver_tel.sector_2_time
    s3 = driver_tel.sector_3_time
    if s1 and s2:
        lap_total = (s1 or 0) + (s2 or 0) + (s3 or 0)
        if lap_total > 0:
            return {
                "sector_1_end": total * (s1 / lap_total),
                "sector_2_end": total * ((s1 + s2) / lap_total),
            }
    return {"sector_1_end": total * 0.33, "sector_2_end": total * 0.66}


# ── Public async entry point ───────────────────────────────────────────────

async def load_telemetry(
    year: int,
    circuit_name: str,
    session_type: str,
    driver_codes: list[str],
    lap_mode: str = "fastest_clean",
) -> Optional[TelemetryData]:
    """
    Load FastF1 telemetry for up to 5 drivers.
    Runs FastF1 sync calls in a thread-pool executor.
    Returns None if the session cannot be found or FastF1 fails.
    """
    f1_name = CIRCUIT_NAME_MAP.get(circuit_name, circuit_name)
    f1_session_type = SESSION_TYPE_MAP.get(session_type, "R")

    loop = asyncio.get_event_loop()
    try:
        session = await loop.run_in_executor(
            None, _load_fastf1_session, year, f1_name, f1_session_type
        )
    except Exception as e:
        logger.warning("[TELEMETRY] FastF1 session load failed (%s %s %s): %s",
                       year, f1_name, f1_session_type, e)
        return None

    drivers_data: list[DriverTelemetry] = []
    reference_tel: Optional[DriverTelemetry] = None

    for code in driver_codes[:5]:
        try:
            drv_tel = await loop.run_in_executor(
                None, _extract_driver_telemetry, session, code, f1_session_type, lap_mode
            )
            if drv_tel and drv_tel.points:
                drivers_data.append(drv_tel)
                if reference_tel is None:
                    reference_tel = drv_tel
        except Exception as e:
            logger.warning("[TELEMETRY] Driver %s failed: %s", code, e)
            continue

    if not drivers_data or reference_tel is None:
        return None

    circuit_outline = _extract_circuit_outline(reference_tel.points)
    sector_boundaries = _compute_sector_boundaries(reference_tel)

    return TelemetryData(
        circuit_key=f"{circuit_name.lower().replace(' ', '_')}_{year}",
        circuit_name=f1_name,
        year=year,
        session_type=session_type,
        circuit_outline=circuit_outline,
        drivers=drivers_data,
        sector_boundaries=sector_boundaries,
        total_distance=reference_tel.points[-1].distance if reference_tel.points else 0,
        confidence="High",
        source="FastF1",
    )
