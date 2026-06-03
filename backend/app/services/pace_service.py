"""True Pace Ranking — filters clean laps and computes per-driver median pace."""
from __future__ import annotations

from app.domain.models import TruePaceRow
from app.utils.statistics import median, is_outlier, confidence_from_sample
from app.utils.time import sc_vsc_laps


def _pit_in_laps(pit: list[dict]) -> dict[int, set[int]]:
    result: dict[int, set[int]] = {}
    for p in pit:
        dn = p.get("driver_number")
        ln = p.get("lap_number")
        if dn and ln:
            result.setdefault(dn, set()).add(ln)
    return result


def compute_true_pace(
    laps: list[dict],
    stints: list[dict],
    pit: list[dict],
    race_control: list[dict],
    drivers: list[dict],
) -> list[TruePaceRow]:
    neutralised = sc_vsc_laps(race_control)
    pit_laps = _pit_in_laps(pit)
    driver_map: dict[int, dict] = {
        d["driver_number"]: d for d in drivers if "driver_number" in d
    }

    by_driver: dict[int, list[dict]] = {}
    for lap in laps:
        dn = lap.get("driver_number")
        if dn:
            by_driver.setdefault(dn, []).append(lap)

    rows: list[TruePaceRow] = []

    for dn, driver_laps in by_driver.items():
        d_info = driver_map.get(dn, {})

        all_durs: list[float] = [
            l["lap_duration"] for l in driver_laps if l.get("lap_duration")
        ]

        clean: list[float] = []
        null_n = pit_n = sc_n = outlier_n = 0

        for lap in driver_laps:
            ln = lap.get("lap_number", 0)
            dur = lap.get("lap_duration")

            # Rule 1: no timing
            if not dur:
                null_n += 1
                continue
            # Rule 2 + 3: pit out or pit in lap
            if lap.get("is_pit_out_lap") or ln in pit_laps.get(dn, set()):
                pit_n += 1
                continue
            # Rule 4: SC/VSC/yellow period
            if ln in neutralised:
                sc_n += 1
                continue
            # Rule 5: statistical outlier (>2.5 IQR)
            if is_outlier(dur, all_durs):
                outlier_n += 1
                continue
            # Rule 6: (sectors not available in races — skip that check per CLAUDE.md)
            clean.append(dur)

        excl: list[str] = []
        if sc_n:
            excl.append(f"{sc_n} lap{'s' if sc_n > 1 else ''} excluded: SC/VSC")
        if pit_n:
            excl.append(f"{pit_n} lap{'s' if pit_n > 1 else ''} excluded: pit in/out")
        if outlier_n:
            excl.append(f"{outlier_n} lap{'s' if outlier_n > 1 else ''} excluded: outlier (>2.5 IQR)")
        if null_n:
            excl.append(f"{null_n} lap{'s' if null_n > 1 else ''} excluded: no timing data")

        if not clean:
            continue

        med = median(clean)
        fastest = min(clean)
        sample = len(clean)
        conf = confidence_from_sample(sample)
        traffic = round(med - fastest, 3)

        code = d_info.get("name_acronym", f"D{dn}")
        team = d_info.get("team_name")
        verdict = (
            f"{code} — {conf} confidence, {sample} clean laps. "
            f"Traffic delta: +{traffic:.3f}s."
        )

        rows.append(
            TruePaceRow(
                driver_number=dn,
                driver_code=code,
                team_name=team,
                team_colour=d_info.get("team_colour"),
                rank=0,
                median_lap=round(med, 3),
                clean_pace=round(fastest, 3),
                traffic_score=traffic,
                sample_size=sample,
                confidence=conf,  # type: ignore[arg-type]
                exclusion_log=excl,
                verdict=verdict,
            )
        )

    rows.sort(key=lambda r: r.clean_pace)
    for i, row in enumerate(rows):
        row.rank = i + 1

    return rows
