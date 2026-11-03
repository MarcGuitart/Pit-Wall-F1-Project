#!/usr/bin/env python3
"""
Recon Lap data: any circuit, from the previous season's pole lap on OpenF1.

    OPENF1_USERNAME=… OPENF1_PASSWORD=… \\
    python3 scripts/recon/build_recon.py Interlagos --for-year 2026 [--out public/recon] [--cache DIR]

On a Mac the credentials can come from the Keychain:
    export OPENF1_USERNAME=$(security find-generic-password -s openf1-username -a pitwall -w)
    export OPENF1_PASSWORD=$(security find-generic-password -s openf1-password -a pitwall -w)

What it does, all from recorded data:
  1. The circuit's meeting in the previous season (OpenF1 circuit_short_name), its Qualifying session and the
     pole: session_result position 1, and that driver's lap whose duration is the pole time.
  2. The lap's location (x, y, z, ~3.7 Hz) becomes the line: resampled to 5 m, smoothed (height more than plan),
     simplified to 0.6 m with Ramer–Douglas–Peucker in 3D. A racing line, not the asphalt's centre.
  3. Distances along the line are scaled to the official lap length (data/circuit_lengths.json, the
     same table as the Block 36 telemetry: one row per season, formula1.com page as the source). The geometry
     itself is left as recorded; only the metre marks move.
  4. car_data (speed, gear, throttle, brake) is placed on the line by time. A braking zone is a run of brake
     samples (one-sample gaps bridged) with a drop of at least 20 km/h to the minimum that follows; zones are
     numbered BZ1… in lap order. They are not the FIA's turn numbers and the page says so. If the lap has no brake
     sample at all, zones are found from the speed instead (runs of hard falls, same 20 km/h rule), the data says
     so ("zones_by": "speed") and the time on the brakes is null: it was not measured.

Output: <out>/<slug>.json (a few KB gzip), where slug is the circuit_short_name in lower-case kebab.
"""
from __future__ import annotations

import argparse, gzip, json, math, os, time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
import urllib.request

API = "https://api.openf1.org/v1"
UNIT = 0.1  # OpenF1 location is in decimetres
HERE = Path(__file__).parent


# ── OpenF1 ──────────────────────────────────────────────────────────────────

class OpenF1:
    def __init__(self, cache: Path | None, rpm: int = 50):
        self.cache, self.gap, self.last, self.requests = cache, 60.0 / rpm, 0.0, 0
        self.token = None
        u, p = os.environ.get("OPENF1_USERNAME"), os.environ.get("OPENF1_PASSWORD")
        if u and p:
            body = urlencode({"username": u, "password": p}).encode()
            with urllib.request.urlopen(urllib.request.Request("https://api.openf1.org/token", data=body), timeout=30) as r:
                self.token = json.load(r)["access_token"]

    def get(self, path: str, **params) -> list[dict]:
        q = "&".join(f"{k}={v}" for k, v in params.items())  # OpenF1 wants date>…, unencoded
        name = f"{path}?{q}".replace("/", "_").replace(":", "-")
        if self.cache and (self.cache / f"{name}.json").exists():
            return json.loads((self.cache / f"{name}.json").read_text())
        for attempt in range(5):
            wait = self.last + self.gap - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self.last = time.monotonic()
            self.requests += 1
            req = urllib.request.Request(f"{API}/{path}?{q}", headers={"Authorization": f"Bearer {self.token}"} if self.token else {})
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    data = json.load(r)
                break
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    data = []
                    break
                if e.code == 429:
                    time.sleep(10 * (attempt + 1))
                    continue
                raise
        else:
            raise RuntimeError(f"{path}: rate limited")
        if self.cache:
            self.cache.mkdir(parents=True, exist_ok=True)
            (self.cache / f"{name}.json").write_text(json.dumps(data))
        return data


def ts(s: str) -> float:
    s = s.replace("Z", "+00:00")
    if "+" not in s[19:]:
        s += "+00:00"
    return datetime.fromisoformat(s).timestamp()


def iso(t: float) -> str:
    return datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")


# ── geometry ────────────────────────────────────────────────────────────────

def smooth_closed(pts, k):
    n, dim = len(pts), len(pts[0])
    return [tuple(sum(pts[(i + j) % n][d] for j in range(-k, k + 1)) / (2 * k + 1) for d in range(dim)) for i in range(n)]


def arclen(pts):
    s = [0.0]
    for a, b in zip(pts, pts[1:]):
        s.append(s[-1] + math.dist(a, b))
    return s


def resample_closed(pts, step):
    loop = pts + [pts[0]]
    s = arclen(loop)
    out, j = [], 0
    for i in range(int(s[-1] // step)):
        t = i * step
        while s[j + 1] < t:
            j += 1
        f = (t - s[j]) / (s[j + 1] - s[j] or 1)
        out.append(tuple(loop[j][d] + f * (loop[j + 1][d] - loop[j][d]) for d in range(3)))
    return out


def rdp(pts, eps):
    keep, stack = {0, len(pts) - 1}, [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        A, B = pts[a], pts[b]
        AB = [B[d] - A[d] for d in range(3)]
        L2 = sum(v * v for v in AB) or 1e-9
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            P = pts[i]
            t = max(0, min(1, sum((P[d] - A[d]) * AB[d] for d in range(3)) / L2))
            dd = math.dist(P, [A[d] + t * AB[d] for d in range(3)])
            if dd > best:
                best, bi = dd, i
        if best > eps:
            keep.add(bi)
            stack += [(a, bi), (bi, b)]
    return sorted(keep)


def nearest_s(p, line, s, total, hint=None, window=80):
    n = len(line)
    idx = range(n) if hint is None else [(hint + j) % n for j in range(-window, window + 1)]
    best, bs, bi = 1e18, 0.0, 0
    for i in idx:
        a, b = line[i], line[(i + 1) % n]
        dx, dy = b[0] - a[0], b[1] - a[1]
        L2 = dx * dx + dy * dy or 1e-9
        t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2))
        d = (a[0] + t * dx - p[0]) ** 2 + (a[1] + t * dy - p[1]) ** 2
        if d < best:
            seg = (s[i + 1] if i + 1 < n else total) - s[i]
            best, bs, bi = d, s[i] + t * seg, i
    return bs, bi


# ── names and plausibility ──────────────────────────────────────────────────

def person_name(full: str | None) -> str | None:
    """OpenF1 writes surnames in capitals ("Lando NORRIS"); the page shows "Lando Norris". Only words written
    entirely in capitals change, and each part after a hyphen or an apostrophe keeps its capital."""
    if not full:
        return full
    def word(w: str) -> str:
        if not (w.isupper() and len(w) > 1):
            return w
        out, cap = [], True
        for ch in w:
            out.append(ch.upper() if cap else ch.lower())
            cap = ch in "-'’"
        return "".join(out)
    return " ".join(word(w) for w in full.split())


# Circuits on flat ground (street circuits and flat sites). On these the recorded height range is expected under
# FLAT_MAX_M: the highest measured on the 2025 pole laps was Monza, 12.4 m (Miami 3.1, Jeddah 2.3, Lusail 4.2,
# Yas Marina 10.9, Melbourne 2.3, Montreal 5.1, Shanghai 6.9, Mexico City 2.6, Singapore 5.2). Any circuit at all
# stays under ANY_MAX_M (Spa, the highest, measures 102 m).
FLAT = {"las vegas", "miami", "baku", "jeddah", "lusail", "yas marina circuit", "sakhir", "melbourne", "montreal",
        "shanghai", "singapore", "mexico city", "monza", "madring"}
FLAT_MAX_M, ANY_MAX_M = 15.0, 120.0
# Held by name until someone has looked at them: published only with --force.
HOLD = {
    "las vegas": "16 m of height on a flat street circuit (block 52b): to be reviewed before publishing",
    "sakhir": "16.4 m on the 2025 pole lap, over the flat limit; possibly a real slope (block 52b). Not needed while the "
              "2026 Bahrain Grand Prix at Sakhir is cancelled: review before publishing",
}


def height_range(loc: list[dict], t0: float, dur: float) -> float:
    """The lap's height range in metres, smoothed as the line is (so the two laps compare like for like)."""
    pts = [(m["x"] * UNIT, m["y"] * UNIT, m["z"] * UNIT) for m in loc if 0 <= ts(m["date"]) - t0 <= dur and (m["x"], m["y"], m["z"]) != (0, 0, 0)]
    if len(pts) < 50:
        return float("nan")
    d = resample_closed(pts, 5.0)
    z = [p[0] for p in smooth_closed([(p[2],) for p in d], 6)]
    return max(z) - min(z)


# ── braking zones ───────────────────────────────────────────────────────────

MIN_DROP = 20        # km/h a zone must lose, from its first sample to the minimum that follows
HARD_STEP = 12       # km/h lost between two consecutive samples (~0.25 s) that counts as braking when there is no brake signal


def _zone(tr, a, b, by_brake):
    # the minimum: from the first sample to where speed stops falling after the last one
    m = min(range(a, min(len(tr), b + 12)), key=lambda k: tr[k]["speed"])
    drop = tr[a]["speed"] - tr[m]["speed"]
    if drop < MIN_DROP:
        return None
    return {"from": tr[a]["s"], "to": tr[b]["s"], "apex": tr[m]["s"], "fromSpeed": round(tr[a]["speed"]),
            "minSpeed": round(tr[m]["speed"]), "drop": round(drop), "gear": tr[m]["gear"],
            # time with the brake pressed exists only when there is a brake signal
            "seconds": round(tr[b]["t"] - tr[a]["t"], 2) if by_brake else None}


def braking_zones(tr: list[dict]) -> tuple[list[dict], str]:
    """tr: samples with s, speed, gear, brake (bool), in lap order. Returns the zones and how they were found.

    "brake": a run of brake samples (one-sample gaps bridged) that loses at least MIN_DROP km/h.
    "speed": used only when the lap has no brake sample at all (the channel is missing or stuck at 0): a run of
    samples that each lose at least HARD_STEP km/h to the next one (one-sample gaps bridged), starting at the sample
    where the fall starts. The brake time is then not known and is left null."""
    n, zones, i = len(tr), [], 0
    by_brake = any(r["brake"] for r in tr)
    hard = [bool(r["brake"]) for r in tr] if by_brake else \
           [k + 1 < n and tr[k]["speed"] - tr[k + 1]["speed"] >= HARD_STEP for k in range(n)]
    while i < n:
        if not hard[i]:
            i += 1
            continue
        a = i
        while i + 1 < n and (hard[i + 1] or (i + 2 < n and hard[i + 2])):
            i += 1
        b = i
        if not by_brake:
            b = min(n - 1, b + 1)  # the run's last step ends on the sample after it
            while b > a and not hard[b - 1]:
                b -= 1
        z = _zone(tr, a, b, by_brake)
        if z:
            zones.append(z)
        i += 1
    for k, z in enumerate(zones, 1):
        z["id"] = k
    return zones, ("brake" if by_brake else "speed")


# ── main ────────────────────────────────────────────────────────────────────

def official_length(table: Path, circuit: str, year: int):
    rows = [r for r in json.loads(table.read_text())["rows"] if r["circuit_short_name"].lower() == circuit.lower() and r.get("length_m")]
    if not rows:
        return None, None
    r = min(rows, key=lambda r: (abs(r["year"] - year), -r["year"]))
    return float(r["length_m"]), r["source"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("circuit", help="OpenF1 circuit_short_name, e.g. Interlagos")
    ap.add_argument("--for-year", type=int, required=True, help="the season the page is for; the pole lap is from the year before")
    ap.add_argument("--out", type=Path, default=HERE.parent.parent / "public" / "recon")
    ap.add_argument("--lengths", type=Path, default=HERE.parents[2] / "data" / "circuit_lengths.json")
    ap.add_argument("--cache", type=Path, default=Path.home() / "pw-work" / "run-cache" / "recon")
    ap.add_argument("--eps", type=float, default=0.6)
    ap.add_argument("--force", action="store_true", help="publish despite a failed height check or a hold (after a review)")
    a = ap.parse_args()
    year = a.for_year - 1
    api = OpenF1(a.cache)

    meeting = next((m for m in api.get("meetings", year=year) if (m.get("circuit_short_name") or "").lower() == a.circuit.lower()
                    and "Testing" not in (m.get("meeting_name") or "")), None)
    if not meeting:
        raise SystemExit(f"no {a.circuit} meeting in {year}")
    q = next((s for s in api.get("sessions", meeting_key=meeting["meeting_key"]) if s["session_name"] == "Qualifying"), None)
    if not q:
        raise SystemExit(f"{meeting['meeting_name']} {year}: no Qualifying session")
    key = q["session_key"]
    result = api.get("session_result", session_key=key)
    pole = next(r for r in result if r.get("position") == 1)
    num = pole["driver_number"]
    dur_list = pole.get("duration")
    pole_time = [d for d in dur_list if d][-1] if isinstance(dur_list, list) else dur_list
    laps = [l for l in api.get("laps", session_key=key, driver_number=num) if l.get("lap_duration") and l.get("date_start")]
    if not laps or not pole_time:
        raise SystemExit(f"{meeting['meeting_name']} {year}: no timed laps for the pole sitter #{num} on OpenF1")
    lap = min(laps, key=lambda l: abs(l["lap_duration"] - pole_time))
    if abs(lap["lap_duration"] - pole_time) > 0.01:
        raise SystemExit(f"pole time {pole_time} not found among the lap durations of #{num}")
    drv = (api.get("drivers", session_key=key, driver_number=num) or [{}])[0]
    t0, dur = ts(lap["date_start"]), lap["lap_duration"]
    window = {"session_key": key, "driver_number": num, "date>": iso(t0 - 1.5), "date<": iso(t0 + dur + 1.5)}
    loc = sorted(api.get("location", **window), key=lambda m: m["date"])
    car = sorted(api.get("car_data", **window), key=lambda m: m["date"])
    print(f"{meeting['meeting_name']} {year} Q: pole #{num} {drv.get('name_acronym')} lap {lap['lap_number']} {dur:.3f}s · "
          f"{len(loc)} location, {len(car)} car_data samples")

    raw = [(m["x"] * UNIT, m["y"] * UNIT, m["z"] * UNIT, ts(m["date"]) - t0) for m in loc]
    raw = [p for p in raw if not (p[0] == 0 and p[1] == 0 and p[2] == 0)]
    inside = [p for p in raw if 0 <= p[3] <= dur]
    dense = resample_closed([p[:3] for p in inside], 5.0)
    dense = smooth_closed(dense, 2)
    zsm = smooth_closed([(p[2],) for p in dense], 6)
    dense = [(p[0], p[1], zsm[i][0]) for i, p in enumerate(dense)]
    cx = (min(p[0] for p in dense) + max(p[0] for p in dense)) / 2
    cy = (min(p[1] for p in dense) + max(p[1] for p in dense)) / 2
    zmin = min(p[2] for p in dense)
    frame = lambda p: (p[0] - cx, p[1] - cy, p[2] - zmin)
    line = [frame(p) for p in dense]
    sf = frame(inside[0][:3])
    k0 = min(range(len(line)), key=lambda i: math.dist(line[i][:2], sf[:2]))
    line = line[k0:] + line[:k0]
    s = arclen(line)
    measured = s[-1] + math.dist(line[-1], line[0])
    official, source = official_length(a.lengths, a.circuit, year)
    k = (official / measured) if official else 1.0

    pos = [(p[3], frame(p[:3])) for p in raw]

    def at(t):
        for (ta, pa), (tb, pb) in zip(pos, pos[1:]):
            if ta <= t <= tb:
                u = (t - ta) / (tb - ta or 1)
                return tuple(pa[d] + u * (pb[d] - pa[d]) for d in range(3))
        return pos[0][1] if t < pos[0][0] else pos[-1][1]

    tr, hint = [], None
    for c in car:
        t = ts(c["date"]) - t0
        if t < 0 or t > dur:
            continue
        sv, hint = nearest_s(at(t), line, s, measured, hint)
        if not tr and sv > measured / 2:  # the first sample can sit just short of the line: it is the lap's start
            sv = 0.0
        elif tr and sv < tr[-1]["s"] / k - measured / 2:  # past the line at the very end of the lap
            sv += measured
        tr.append({"s": round(sv * k, 1), "t": round(t, 2), "speed": float(c.get("speed") or 0), "gear": int(c.get("n_gear") or 0),
                   "brake": (c.get("brake") or 0) > 0, "throttle": float(c.get("throttle") or 0)})
    zones, zones_by = braking_zones(tr)

    # Height checks. The P2 driver's best lap is measured the same way: a real hill shows on both laps, noise
    # or a bad z does not. Failing any check prints why and writes nothing (unless --force after a review).
    height = max(p[2] for p in line)
    problems = []
    flat = a.circuit.lower() in FLAT
    if height > (FLAT_MAX_M if flat else ANY_MAX_M):
        problems.append(f"height range {height:.1f} m is over {FLAT_MAX_M if flat else ANY_MAX_M:.0f} m for a {'flat' if flat else ''} circuit".replace("  ", " "))
    p2 = next((r for r in result if r.get("position") == 2), None)
    check = None
    if p2:
        d2 = p2.get("duration")
        t2 = [d for d in d2 if d][-1] if isinstance(d2, list) else d2
        l2 = [l for l in api.get("laps", session_key=key, driver_number=p2["driver_number"]) if l.get("lap_duration") and l.get("date_start")]
        if l2 and t2:
            b = min(l2, key=lambda l: abs(l["lap_duration"] - t2))
            u0 = ts(b["date_start"])
            loc2 = api.get("location", session_key=key, driver_number=p2["driver_number"], **{"date>": iso(u0 - 1.5), "date<": iso(u0 + b["lap_duration"] + 1.5)})
            check = height_range(loc2, u0, b["lap_duration"])
    if check is None or check != check:
        problems.append("no second lap (P2) to check the height against")
    elif abs(check - height) > max(3.0, 0.25 * height):
        problems.append(f"height {height:.1f} m on the pole lap but {check:.1f} m on P2's lap")
    if a.circuit.lower() in HOLD:
        problems.append(f"on hold: {HOLD[a.circuit.lower()]}")
    print(f"height: pole lap {height:.1f} m, P2 lap {check if check is not None else float('nan'):.1f} m{' (flat circuit)' if flat else ''}")
    if problems and not a.force:
        print("NOT PUBLISHED:\n  " + "\n  ".join(problems) + "\n  (review the lap, then run again with --force to publish)")
        raise SystemExit(2)
    if problems:
        print("published with --force despite:\n  " + "\n  ".join(problems))

    keep = rdp(line + [line[0]], a.eps)[:-1]
    q1 = lambda v: round(v, 1)
    slug = a.circuit.lower().replace(" ", "-")
    data = {
        "slug": slug, "circuit": a.circuit, "event": meeting["meeting_name"], "location": meeting.get("location"),
        "for_year": a.for_year, "year": year, "session_key": key,
        "lap": {"driver": drv.get("name_acronym"), "driver_name": person_name(drv.get("full_name")), "number": lap["lap_number"],
                "time": dur, "session": "Qualifying", "kind": "pole"},
        "length_m": round(official or measured, 1), "measured_m": round(measured, 1), "length_source": source,
        "elevation_m": q1(height), "elevation_check_m": q1(check) if check is not None else None,
        "line": [[q1(p[0]), q1(p[1]), q1(p[2])] for p in (line[i] for i in keep)],
        "line_s": [q1(s[i] * k) for i in keep],
        "zones": zones, "zones_by": zones_by,
        "trace": [[r["s"], round(r["speed"]), r["gear"], 1 if r["brake"] else 0, round(r["throttle"]), r["t"]] for r in tr],
        "source": f"OpenF1 location (x, y, z) and car_data, session {key}",
        "note": ("Braking zones are numbered in lap order (BZ1…); they are not the FIA turn numbers. The line is the pole "
                 "lap's own path, smoothed; distances are scaled to the official lap length"
                 + (f" ({official:.0f} m, measured {measured:.0f} m)." if official else " (none on record: measured length).")),
    }
    a.out.mkdir(parents=True, exist_ok=True)
    out = a.out / f"{slug}.json"
    b = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode()
    out.write_bytes(b)
    print(f"{out}: {len(b)/1024:.1f} KB, gzip {len(gzip.compress(b, 9))/1024:.1f} KB · line {len(line)} → {len(keep)} points "
          f"({len(json.dumps(data['line'], separators=(',', ':')))/1024:.1f} KB) · measured {measured:.0f} m → official "
          f"{official or measured:.0f} m (×{k:.4f}) · elevation {data['elevation_m']} m · {len(zones)} braking zones · {api.requests} requests")
    for z in zones:
        print(f"  BZ{z['id']:<2} {z['from']:>7.1f}→{z['to']:>7.1f} m  {z['fromSpeed']:>3}→{z['minSpeed']:>3} km/h (−{z['drop']})  gear {z['gear']}  {z['seconds']} s")
    print(f"zones found by: {zones_by}")


if __name__ == "__main__":
    main()
