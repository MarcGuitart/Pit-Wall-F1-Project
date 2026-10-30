#!/usr/bin/env python3
"""
Race telemetry from OpenF1 (block 36), for the telemetry tab: one file per race and lap mode with the whole field,
in the TelemetryData shape the site already reads (types/telemetry.ts), written as

    <out>/telemetry/v1/<session_key>/fastest_clean.json
    <out>/telemetry/v1/<session_key>/representative.json

and uploaded to R2 by .github/workflows/telemetry-openf1.yml. One lap per driver (FastF1's rule for the two
modes, see pick_laps), car_data placed on the location trace, distance integrated from speed and scaled to the
official lap length (data/circuit_lengths.json, the table the Recon Lap uses too).

    python scripts/openf1_telemetry.py --sessions 9636,11396 [--out DIR] [--rpm 55]
    python scripts/openf1_telemetry.py --season 2024 --skip-index index.json

Credentials: OPENF1_USERNAME / OPENF1_PASSWORD (the account's 55 requests a minute); anonymous otherwise, slower.
Measured 30 Oct with the account: Interlagos 2024 81.5 s and Austin 2026 99.7 s, about 75 to 91 requests a race,
51 MB of memory, 97 to 145 KB gzip a file. The last stdout line is REPORT:{json}.
"""
from __future__ import annotations

import argparse, gzip, json, math, os, statistics, sys, time
from datetime import datetime, timezone
from pathlib import Path

import httpx

API = "https://api.openf1.org/v1"
POINTS = 300


class Client:
    def __init__(self, rpm: int):
        self.gap = 60.0 / rpm
        self.last = 0.0
        self.requests = 0
        self.bytes = 0
        self.headers = {}
        u, p = os.environ.get("OPENF1_USERNAME"), os.environ.get("OPENF1_PASSWORD")
        if u and p:
            r = httpx.post("https://api.openf1.org/token", data={"username": u, "password": p}, timeout=30)
            r.raise_for_status()
            self.headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
        self.http = httpx.Client(timeout=120, headers=self.headers)

    def get(self, path: str, **params) -> list[dict]:
        for attempt in range(5):
            wait = self.last + self.gap - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self.last = time.monotonic()
            self.requests += 1
            r = self.http.get(f"{API}/{path}", params=params)
            self.bytes += len(r.content)
            if r.status_code == 429:
                time.sleep(10 * (attempt + 1)); continue
            if r.status_code == 404:
                return []
            r.raise_for_status()
            return r.json()
        raise RuntimeError(f"{path}: rate limited")


def ts(s: str) -> float:
    """OpenF1 dates are UTC; a value without an offset is read as UTC too, never as the machine's local time."""
    d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).timestamp()


def pick_laps(laps: list[dict]) -> dict[str, dict]:
    """FastF1's rule (app/services/telemetry_service.py _pick_lap): the pool is every timed lap that is neither a
    pit-in nor a pit-out lap (lap 1 included); fastest_clean is its fastest, representative the one closest to its
    median. A pit-in lap is the lap before a pit-out lap."""
    by_n = {l["lap_number"]: l for l in laps}
    pool = [l for l in laps if l.get("lap_duration") and l.get("date_start") and not l.get("is_pit_out_lap")
            and not (by_n.get(l["lap_number"] + 1) or {}).get("is_pit_out_lap")]
    if not pool:
        return {}
    fastest = min(pool, key=lambda l: l["lap_duration"])
    med = statistics.median(l["lap_duration"] for l in pool)
    rep = min(pool, key=lambda l: abs(l["lap_duration"] - med))
    return {"fastest_clean": fastest, "representative": rep}


# Official lap lengths in metres: data/circuit_lengths.json (built by data/build_lengths.py from each Grand
# Prix's formula1.com page, one row per season and the page as source). Samples come at about 3.7 Hz, so the speed
# integral falls 1.6 to 3 % short of a real lap (corners are cut); every lap is scaled to the official length. The
# row of the session's own season wins; otherwise the nearest season of the same circuit. A circuit with no row is
# not scaled and says so in the file's note.
LENGTHS_FILE = Path(os.environ.get("PW_LENGTHS", Path(__file__).resolve().parents[2] / "data" / "circuit_lengths.json"))


def official_length(circuit: str | None, year: int | None) -> tuple[float | None, str | None]:
    """(metres, source URL) for an OpenF1 circuit_short_name in a season, or (None, None)."""
    if not circuit or not LENGTHS_FILE.exists():
        return None, None
    rows = [r for r in json.loads(LENGTHS_FILE.read_text())["rows"]
            if r["circuit_short_name"].lower() == circuit.lower() and r.get("length_m")]
    if not rows:
        return None, None
    r = min(rows, key=lambda r: (abs(r["year"] - (year or r["year"])), -r["year"]))
    return float(r["length_m"]), r["source"]


def g_forces(xs: list[float], ys: list[float], v_kmh: list[float], dist: list[float]) -> tuple[list[float], list[float]]:
    """Lateral and longitudinal g along the lap, as app/services/telemetry_service._compute_gg does (arc-length
    derivatives, 9-point box filter, clipped to ±5 g) but in plain Python and with x, y in metres: OpenF1 (like
    FastF1) gives position in decimetres, and curvature taken over decimetres comes out ten times too small."""
    n = len(v_kmh)
    if n < 6:
        return [0.0] * n, [0.0] * n
    d = list(dist)
    for i in range(1, n):
        if d[i] <= d[i - 1]:
            d[i] = d[i - 1] + 0.01
    v = [k / 3.6 for k in v_kmh]

    def grad(f: list[float]) -> list[float]:
        out = [(f[1] - f[0]) / (d[1] - d[0])]
        out += [(f[i + 1] - f[i - 1]) / (d[i + 1] - d[i - 1]) for i in range(1, n - 1)]
        return out + [(f[-1] - f[-2]) / (d[-1] - d[-2])]

    def smooth(f: list[float], k: int = 9) -> list[float]:
        h = k // 2
        return [sum(f[j] for j in range(max(0, i - h), min(n, i + h + 1))) / k for i in range(n)]

    lon = [a * b / 9.81 for a, b in zip(grad(v), v)]
    dx, dy = grad(xs), grad(ys)
    ddx, ddy = grad(dx), grad(dy)
    lat = []
    for i in range(n):
        den = max((dx[i] ** 2 + dy[i] ** 2) ** 1.5, 1e-12)
        lat.append(v[i] ** 2 * (dx[i] * ddy[i] - dy[i] * ddx[i]) / den / 9.81)
    clip = lambda f: [round(max(-5.0, min(5.0, x)), 3) for x in smooth(f)]
    return clip(lat), clip(lon)


def trace(car: list[dict], loc: list[dict], start: float, end: float, length: float | None = None) -> list[dict]:
    car = sorted(car, key=lambda r: r["date"]); loc = sorted(loc, key=lambda r: r["date"])
    if len(car) < 10 or len(loc) < 10:
        return []
    lt = [ts(r["date"]) for r in loc]
    out, dist, prev, j = [], 0.0, start, 0
    for r in car:
        t = ts(r["date"])
        # The first sample's speed is held back to the start of the lap (and the last forward to its end), so a lap
        # whose samples begin late or stop early is not short by the missing seconds.
        dist += (r.get("speed") or 0) / 3.6 * (t - prev)
        prev = t
        while j + 1 < len(lt) and lt[j + 1] <= t:
            j += 1
        out.append({"distance": dist, "x": loc[j]["x"], "y": loc[j]["y"], "speed": float(r.get("speed") or 0),
                    "throttle": float(r.get("throttle") or 0), "brake": bool(r.get("brake")), "gear": int(r.get("n_gear") or 0),
                    "drs": int(r.get("drs") or 0), "race_time": t - start})
    tail = (car[-1].get("speed") or 0) / 3.6 * max(0.0, end - prev)
    total = dist + tail
    if length and total > 0:
        k = length / total
        for p in out:
            p["distance"] *= k
    lat, lon = g_forces([p["x"] * 0.1 for p in out], [p["y"] * 0.1 for p in out], [p["speed"] for p in out], [p["distance"] for p in out])
    for p, a, b in zip(out, lat, lon):
        p["lat_g"], p["lon_g"] = a, b
    step = max(1, len(out) // POINTS)
    return out[::step]


def normalise(drivers: list[dict]) -> None:
    xs = [p["x"] for d in drivers for p in d["points"]]; ys = [p["y"] for d in drivers for p in d["points"]]
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    scale = max(max(xs) - min(xs), max(ys) - min(ys)) / 2 or 1
    for d in drivers:
        for p in d["points"]:
            p["x"] = round((p["x"] - cx) / scale, 4); p["y"] = round((p["y"] - cy) / scale, 4)
            p["distance"] = round(p["distance"], 1); p["race_time"] = round(p["race_time"], 3)


def build(client: Client, key: int, out: Path) -> dict:
    t0, r0, b0 = time.monotonic(), client.requests, client.bytes
    session = (client.get("sessions", session_key=key) or [None])[0]
    if not session:
        return {"session_key": key, "skipped": "no such session on OpenF1", "files": {}}
    if session.get("session_name") != "Race":
        # The telemetry tab exists for races only (the API answers TELEMETRY_RACE_ONLY elsewhere).
        return {"session_key": key, "skipped": f"not a race ({session.get('session_name')})", "files": {}}
    drivers = client.get("drivers", session_key=key)
    laps = client.get("laps", session_key=key)
    by_driver: dict[int, list] = {}
    for l in laps:
        by_driver.setdefault(l["driver_number"], []).append(l)
    files = {}
    length, length_src = official_length(session.get("circuit_short_name"), session.get("year"))
    for mode in ("fastest_clean", "representative"):
        result = []
        for d in drivers:
            chosen = pick_laps(by_driver.get(d["driver_number"], [])).get(mode)
            if not chosen:
                continue
            s = ts(chosen["date_start"]); e = s + chosen["lap_duration"]
            window = {"session_key": key, "driver_number": d["driver_number"],
                      "date>": datetime.fromtimestamp(s, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f"), "date<": datetime.fromtimestamp(e, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")}
            pts = trace(client.get("car_data", **window), client.get("location", **window), s, e, length)
            if not pts:
                continue
            result.append({"driver_code": d["name_acronym"], "team_colour": "#" + (d.get("team_colour") or "FFFFFF"),
                           "lap_time": chosen["lap_duration"], "fastest_lap_number": chosen["lap_number"], "lap_mode": mode,
                           "points": pts, "sector_1_time": chosen.get("duration_sector_1"),
                           "sector_2_time": chosen.get("duration_sector_2"), "sector_3_time": chosen.get("duration_sector_3")})
        if not result:
            continue
        normalise(result)
        ref = min(result, key=lambda d: d["lap_time"])
        total = ref["points"][-1]["distance"]
        s1 = (ref["sector_1_time"] or ref["lap_time"] / 3) / ref["lap_time"] * total
        s2 = s1 + (ref["sector_2_time"] or ref["lap_time"] / 3) / ref["lap_time"] * total
        data = {"circuit_key": f"{(session.get('circuit_short_name') or 'race').lower().replace(' ', '_')}_{session.get('year')}",
                "circuit_name": session.get("circuit_short_name") or "Race", "year": session.get("year") or 0,
                "session_type": session.get("session_name") or "Race",
                "circuit_outline": [{"x": p["x"], "y": p["y"], "distance": p["distance"]} for p in ref["points"]],
                "drivers": result, "sector_boundaries": {"sector_1_end": round(s1, 1), "sector_2_end": round(s2, 1)},
                "total_distance": round(total, 1), "confidence": "Medium", "source": "OpenF1 car_data + location",
                "note": "One lap per driver from OpenF1 car_data and location; distance integrated from speed"
                + (f" and scaled to the official lap length ({length:.0f} m, {length_src})." if length else ", not scaled (no official length on record).")}
        raw = json.dumps(data, separators=(",", ":")).encode()
        p = out / "telemetry" / "v1" / str(key) / f"{mode}.json"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(raw)
        files[mode] = {"drivers": len(result), "bytes": len(raw), "gzip_bytes": len(gzip.compress(raw))}
    return {"session_key": key, "name": f"{session.get('circuit_short_name')} {session.get('year')} {session.get('session_name')}",
            "requests": client.requests - r0, "seconds": round(time.monotonic() - t0, 1),
            "downloaded_mb": round((client.bytes - b0) / 1048576, 2), "files": files}


def race_sessions(client: Client, season: int) -> list[int]:
    """Every race of a season that has started, in date order (sprints are not races here)."""
    now = time.time()
    rows = client.get("sessions", year=season, session_name="Race")
    return [s["session_key"] for s in sorted(rows, key=lambda s: s["date_start"]) if ts(s["date_start"]) < now and not s.get("is_cancelled")]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sessions", default="", help="session keys, comma-separated")
    ap.add_argument("--season", type=int, help="every race of a season so far")
    ap.add_argument("--skip-index", type=Path, help="an index.json (telemetry_index.py): sessions already in it are skipped")
    ap.add_argument("--limit", type=int, default=0, help="at most this many sessions (0: all)")
    ap.add_argument("--out", type=Path, default=Path("telemetry-out"))
    ap.add_argument("--rpm", type=int, default=55)
    ap.add_argument("--list", action="store_true", help="print the sessions that would be built, one per line, and stop")
    a = ap.parse_args()
    c = Client(a.rpm)
    keys = [int(k) for k in a.sessions.replace(" ", "").split(",") if k]
    if a.season:
        keys += race_sessions(c, a.season)
    if a.skip_index and a.skip_index.exists():
        have = {int(k) for k in json.loads(a.skip_index.read_text()).get("sessions", {})}
        keys = [k for k in keys if k not in have]
    keys = list(dict.fromkeys(keys))[: a.limit or None]
    if a.list:
        print("\n".join(map(str, keys)))
        return 0
    print(json.dumps({"auth": bool(c.headers), "rpm": a.rpm, "sessions": keys}), flush=True)
    report = {"built": [], "skipped": [], "failed": []}
    for k in keys:
        try:
            r = build(c, k, a.out)
        except Exception as e:  # one race failing must not stop a batch
            report["failed"].append({"session_key": k, "error": f"{type(e).__name__}: {e}"})
            print(json.dumps(report["failed"][-1]), flush=True)
            continue
        print(json.dumps(r), flush=True)
        if r.get("skipped"):
            report["skipped"].append({"session_key": k, "why": r["skipped"]})
        elif r["files"]:
            report["built"].append(k)
        else:
            report["failed"].append({"session_key": k, "error": "no driver had a usable lap"})
    report["requests"] = c.requests
    print("REPORT:" + json.dumps(report), flush=True)
    return 1 if keys and not report["built"] and report["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
