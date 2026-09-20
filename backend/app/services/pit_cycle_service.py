"""
Pit cycles — the causal unit for pit-stop position changes.

A lap is not a unit of cause: a driver's position moves because *the group
around him* stops over a window of laps. So stops are grouped into cycles and
every position delta is read when the cycle closes, not at a fixed +3 laps.

Cycle definition (documented here, constants below):
- eligible stops: racing and safety_car (red-flag holds are not stops)
- sorted by lap; a stop joins the open cycle if its lap is within
  CYCLE_GAP_LAPS of the cycle's last stop lap AND, when it comes on a later
  lap, its driver was within CYCLE_ADJACENCY places (positions at the cycle
  open) of someone who already stopped in the cycle. A stop by a driver from
  another part of the field opens a new cycle even a lap later: a 16-lap
  chain across the whole grid is two pit windows (back of the field, then
  the front), not one. Stops on the same lap as the last one always join.
- open_lap  = first stop lap of the cycle
- close_lap = min(last stop lap + SETTLE_LAPS, total laps): the last stopper's
  out-lap has settled
- participants: every driver classified at both (open_lap - 1) and close_lap —
  those who did not stop are in the cycle too, their position moves because
  of the others' stops
- delta (per participant) = position at start of (open_lap - 1) minus position
  at start of close_lap; positive = gained
- undercut: attacker stopped on an earlier lap than the target, the target
  was ahead of the attacker at the open by at most RIVAL_BAND places, and the
  attacker is ahead of the target at the close
- neutralised: any lap in [open_lap, close_lap] under SC/VSC — position
  changes inside the cycle cannot be attributed to stop timing alone
"""
from __future__ import annotations

from collections import defaultdict

from app.domain.models import PitCycle, PitCycleDriver, PitImpactRow, Undercut
from app.domain.race_timeline import RaceTimeline
from app.utils.time import position_at_lap

CYCLE_GAP_LAPS = 2      # max laps between consecutive stops of one cycle
SETTLE_LAPS = 2         # laps after the last stop before the cycle is read
RIVAL_BAND = 4          # max places between attacker and target for an undercut
CYCLE_ADJACENCY = 6     # a later-lap stop continues the cycle only if its driver was this close to a stopper


def _group_stops(
    rows: list[PitImpactRow],
    position_data: list[dict],
    laps: list[dict],
    all_drivers: list[int],
) -> list[list[PitImpactRow]]:
    eligible = sorted((r for r in rows if r.stop_type != "red_flag"), key=lambda r: r.lap_number)
    cycles: list[list[PitImpactRow]] = []
    open_pos: dict[int, int] = {}          # positions at the open of the current cycle
    stopped: set[int] = set()

    def adjacent_to_a_stopper(r: PitImpactRow) -> bool:
        pos = open_pos.get(r.driver_number, r.position_before)
        if pos is None:
            return True
        return any(abs(pos - open_pos.get(sd, 999)) <= CYCLE_ADJACENCY for sd in stopped)

    for r in eligible:
        joins = bool(cycles) and r.lap_number - cycles[-1][-1].lap_number <= CYCLE_GAP_LAPS
        if joins and r.lap_number > cycles[-1][-1].lap_number and not adjacent_to_a_stopper(r):
            joins = False
        if joins:
            cycles[-1].append(r)
        else:
            cycles.append([r])
            before_lap = max(1, r.lap_number - 1)
            open_pos = {
                dn: p for dn in all_drivers
                if (p := position_at_lap(dn, before_lap, position_data, laps)) is not None
            }
            stopped = set()
        stopped.add(r.driver_number)
    return cycles


def detect_pit_cycles(
    rows: list[PitImpactRow],
    position_data: list[dict],
    laps: list[dict],
    drivers: list[dict],
    timeline: RaceTimeline,
) -> list[PitCycle]:
    total_laps = timeline.total_laps or max((l.get("lap_number") or 0 for l in laps), default=0)
    codes = {d["driver_number"]: d.get("name_acronym", f"D{d['driver_number']}") for d in drivers if "driver_number" in d}
    all_drivers = sorted({l["driver_number"] for l in laps if l.get("driver_number")})

    cycles: list[PitCycle] = []
    for idx, group in enumerate(_group_stops(rows, position_data, laps, all_drivers), start=1):
        open_lap = group[0].lap_number
        close_lap = min(group[-1].lap_number + SETTLE_LAPS, total_laps)
        before_lap = max(1, open_lap - 1)
        stops_by_driver: dict[int, list[int]] = defaultdict(list)
        for r in group:
            stops_by_driver[r.driver_number].append(r.lap_number)

        participants: list[PitCycleDriver] = []
        for dn in all_drivers:
            before = position_at_lap(dn, before_lap, position_data, laps)
            after = position_at_lap(dn, close_lap, position_data, laps)
            if before is None or after is None:
                continue
            participants.append(PitCycleDriver(
                driver_number=dn,
                driver_code=codes.get(dn, f"D{dn}"),
                stopped=dn in stops_by_driver,
                stop_laps=sorted(stops_by_driver.get(dn, [])),
                position_before=before,
                position_after=after,
                delta=before - after,
            ))

        by_dn = {p.driver_number: p for p in participants}
        undercuts: list[Undercut] = []
        for a in participants:
            if not a.stopped:
                continue
            a_lap = min(a.stop_laps)
            for t in participants:
                if not t.stopped or t.driver_number == a.driver_number:
                    continue
                t_lap = min(t.stop_laps)
                if (
                    a_lap < t_lap
                    and 0 < a.position_before - t.position_before <= RIVAL_BAND
                    and a.position_after < t.position_after
                ):
                    undercuts.append(Undercut(
                        attacker=a.driver_code, target=t.driver_code,
                        attacker_lap=a_lap, target_lap=t_lap,
                    ))

        neutralised = any(
            (s.sc_active or s.vsc_active)
            for n, s in timeline.laps.items() if open_lap <= n <= close_lap
        )
        stoppers = [p for p in participants if p.stopped]
        gainers = sorted((p for p in participants if p.delta > 0), key=lambda p: -p.delta)[:3]
        losers = sorted((p for p in participants if p.delta < 0), key=lambda p: p.delta)[:3]
        summary = (
            f"Laps {open_lap}–{group[-1].lap_number}, read at L{close_lap}: "
            f"{len(group)} stop(s) by {len(stoppers)} driver(s)"
            + (f"; gained: {', '.join(f'{p.driver_code} {p.delta:+d}' for p in gainers)}" if gainers else "")
            + (f"; lost: {', '.join(f'{p.driver_code} {p.delta:+d}' for p in losers)}" if losers else "")
            + (f"; undercuts: {', '.join(f'{u.attacker}>{u.target}' for u in undercuts)}" if undercuts else "")
            + ("; under SC/VSC — timing attribution unreliable" if neutralised else "")
            + "."
        )
        cycles.append(PitCycle(
            cycle_id=idx,
            lap_start=open_lap,
            lap_end=group[-1].lap_number,
            close_lap=close_lap,
            stops=len(group),
            neutralised=neutralised,
            participants=participants,
            undercuts=undercuts,
            summary=summary,
        ))
        for r in group:
            r.cycle_id = idx
    return cycles
