#!/usr/bin/env python3
"""
Official lap lengths per Grand Prix, 2023, 2024 and 2026: data/circuit_lengths.json, the one table the OpenF1
telemetry (backend/scripts/openf1_telemetry.py) and the Recon Lap (frontend/scripts/recon/build_recon.py) both read.

    python3 data/build_lengths.py --meetings ~/pw-work/run-cache --out data/circuit_lengths.json

Rows come from OpenF1's meetings_<year>.json (pre-season testing left out). Each length is the "Circuit Length"
on that Grand Prix's formula1.com page for that year, and the row keeps the URL it was read from. A row whose
page or figure was not found is "a verificar", with no length.
"""
from __future__ import annotations

import argparse, json, re, time, urllib.request
from pathlib import Path

SLUG = {
    "Australian": "australia", "Chinese": "china", "Japanese": "japan", "Bahrain": "bahrain",
    "Saudi Arabian": "saudi-arabia", "Miami": "miami", "Emilia Romagna": "emiliaromagna", "Monaco": "monaco",
    "Canadian": "canada", "Spanish": "spain", "Barcelona": "barcelona-catalunya", "Austrian": "austria",
    "British": "great-britain", "Hungarian": "hungary", "Belgian": "belgium", "Dutch": "netherlands",
    "Italian": "italy", "Azerbaijan": "azerbaijan", "Singapore": "singapore", "United States": "united-states",
    "Mexico City": "mexico", "São Paulo": "brazil", "Las Vegas": "las-vegas", "Qatar": "qatar",
    "Abu Dhabi": "united-arab-emirates",
}


def fetch(url: str) -> str | None:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (pit-wall length table)"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", "replace") if r.status == 200 else None
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(2 * (attempt + 1))
        except Exception:
            time.sleep(2 * (attempt + 1))
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--meetings", type=Path, default=Path.home() / "pw-work/run-cache")
    ap.add_argument("--years", default="2023,2024,2026")
    ap.add_argument("--out", type=Path, default=Path("circuit_lengths.json"))
    a = ap.parse_args()
    rows = []
    for year in map(int, a.years.split(",")):
        for m in sorted(json.load(open(a.meetings / f"meetings_{year}.json")), key=lambda m: m["date_start"]):
            if "Testing" in m["meeting_name"]:
                continue
            key = m["meeting_name"].replace(" Grand Prix", "")
            slug = SLUG.get(key)
            url = f"https://www.formula1.com/en/racing/{year}/{slug}" if slug else None
            html = fetch(url) if url else None
            km = None
            title = None
            if html:
                hit = re.search(r"Circuit Length.{0,400}?(\d\.\d{1,3})\s*km", html, re.S)
                km = float(hit.group(1)) if hit else None
                t = re.search(r"<title>(.*?)</title>", html, re.S)
                title = t.group(1).strip() if t else None
            rows.append({
                "year": year, "meeting_key": m["meeting_key"], "meeting_name": m["meeting_name"],
                "circuit_short_name": m["circuit_short_name"], "location": m.get("location"),
                "cancelled": bool(m.get("is_cancelled")),
                "length_m": round(km * 1000) if km else None,
                "source": url, "page_title": title,
                "status": "ok" if km else "a verificar",
            })
            print(f"{year} {m['circuit_short_name']:<20} {rows[-1]['length_m'] or '—':>6}  {rows[-1]['status']:<11} {url}", flush=True)
            time.sleep(0.6)
    # A cancelled Grand Prix's page for that year no longer describes its circuit (2026: the Bahrain page is the
    # race moved to Sepang, the Saudi one is a news story). Its row takes the latest earlier season's page instead.
    for r in rows:
        r.setdefault("note", None)
        shared = [o for o in rows if o is not r and o["year"] == r["year"] and o["source"] == r["source"] and not o["cancelled"]]
        if r["cancelled"] and (shared or not r["length_m"]):
            prev = [o for o in rows if o["circuit_short_name"] == r["circuit_short_name"] and o["year"] < r["year"] and o["length_m"]]
            if prev:
                p = max(prev, key=lambda o: o["year"])
                r.update(length_m=p["length_m"], source=p["source"], page_title=p["page_title"], status="ok",
                         note=f"{r['year']} event cancelled; its {r['year']} page is not about this circuit. Length from the {p['year']} page.")
            else:
                r.update(length_m=None, status="a verificar", note="cancelled; no page with this circuit's length")
    a.out.write_text(json.dumps({
        "about": "Official lap length per Grand Prix (metres), read from each Grand Prix's formula1.com page for that "
                 "year ('Circuit Length'); 'source' is the page. 'a verificar': no page or no figure found.",
        "rows": rows,
    }, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
