"""
Team radio — archive clips from OpenF1's /team_radio, mapped to laps.

The endpoint gives date, driver_number and recording_url only. Each clip is
placed on the lap the *driver* was on at that timestamp (the driver's own
laps.date_start, through the same lap_for_time used by weather/intervals).
Clips before the driver's first lap are "pre" session, clips after the end
of their last lap are "post"; neither is forced onto a lap.

recording_url points at F1's CDN. It is normalised (path percent-encoded,
idempotently) because names like "São_Paulo" break <audio> unless encoded.
Nothing is downloaded or mirrored here.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import timedelta
from urllib.parse import quote, unquote, urlsplit, urlunsplit

from app.domain.models import TeamRadioAnalysis, TeamRadioClip
from app.services.weather_conditions import lap_for_time, lap_time_index, parse_ts

POST_SESSION_GRACE_S = 120.0     # after the last lap start when its duration is unknown


def normalise_recording_url(url: str) -> str:
    """Percent-encode the path once (idempotent); scheme/host/query untouched."""
    parts = urlsplit(url.strip())
    # unquote() first so "S%C3%A3o" and "São" encode to the same path (no double-encoding)
    path = quote(unquote(parts.path), safe="/")
    return urlunsplit((parts.scheme, parts.netloc, path, parts.query, parts.fragment))


def compute_team_radio(
    team_radio: list[dict],
    laps: list[dict],
    drivers: list[dict],
) -> TeamRadioAnalysis | None:
    """None when the session published no radio at all (module: not_applicable)."""
    if not team_radio:
        return None

    codes = {d["driver_number"]: d.get("name_acronym", f"D{d['driver_number']}") for d in drivers if "driver_number" in d}
    teams = {d["driver_number"]: d.get("team_name") for d in drivers if "driver_number" in d}
    laps_by_driver: dict[int, list[dict]] = defaultdict(list)
    for lap in laps:
        if lap.get("driver_number") and lap.get("lap_number"):
            laps_by_driver[lap["driver_number"]].append(lap)

    clips: list[TeamRadioClip] = []
    for r in team_radio:
        dn = r.get("driver_number")
        t = parse_ts(r.get("date"))
        url = r.get("recording_url")
        if not dn or t is None or not url:
            continue
        index = lap_time_index(laps_by_driver.get(dn, []))
        lap_number: int | None = None
        phase = "race"
        if not index:
            phase = "pre"                       # driver never set a lap (or no lap data)
        elif t < index[0][1]:
            phase = "pre"
        else:
            last_lap, last_start = index[-1]
            last_rec = next((l for l in laps_by_driver[dn] if l.get("lap_number") == last_lap), {})
            dur = last_rec.get("lap_duration")
            last_end = last_start + timedelta(seconds=float(dur) if dur else POST_SESSION_GRACE_S)
            if t >= last_end:
                phase = "post"
            else:
                lap_number = lap_for_time(t, index)
        clips.append(TeamRadioClip(
            driver_number=dn,
            driver_code=codes.get(dn, f"D{dn}"),
            team_name=teams.get(dn),
            date=t.isoformat(),
            lap_number=lap_number,
            phase=phase,  # type: ignore[arg-type]
            recording_url=normalise_recording_url(url),
        ))

    clips.sort(key=lambda c: c.date)
    per_driver: dict[str, int] = defaultdict(int)
    for c in clips:
        per_driver[c.driver_code] += 1
    in_race = sum(1 for c in clips if c.phase == "race")
    return TeamRadioAnalysis(
        clips=clips,
        total=len(clips),
        in_race=in_race,
        pre_session=sum(1 for c in clips if c.phase == "pre"),
        post_session=sum(1 for c in clips if c.phase == "post"),
        clips_per_driver=dict(sorted(per_driver.items(), key=lambda kv: -kv[1])),
        summary=(
            f"{len(clips)} team radio clip(s) published for {len(per_driver)} driver(s); "
            f"{in_race} during the race. Selection is F1's, not the full record."
        ),
    )
