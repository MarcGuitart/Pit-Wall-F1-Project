'use client'

import { useEffect, useState } from 'react'
import { placeOf } from '@/lib/place'
import { fetchRaces, fetchSessions } from '@/lib/api'
import { findRaceSession } from '@/lib/nextSession'
import { FREE_SEASONS, isFreeSeason } from '@/lib/access'
import { seasonYears } from '@/lib/seasons'
import { seasonGrid, type GridRace } from '@/lib/seasonGrid'
import { useOpenRace } from '@/lib/raceNav'
import { useAccessStore } from '@/stores/accessStore'
import { Segmented, ui } from '@/components/ui'
import l from './landing.module.css'

/**
 * The season as a grid of Grands Prix (the /preview season view, now the
 * landing's). A cell opens that meeting's race; any other session is one
 * section down, in the session selector. Rounds and names: lib/seasonGrid.ts.
 */
export function SeasonGrid() {
  const pro = useAccessStore((st) => st.pro)
  const years = seasonYears()
  // A free reader starts on the newest free season, a PRO reader on the current one.
  const [season, setSeason] = useState(() => FREE_SEASONS[FREE_SEASONS.length - 1])
  const [touched, setTouched] = useState(false)
  useEffect(() => { if (pro && !touched) setSeason(years[0]) }, [pro]) // eslint-disable-line react-hooks/exhaustive-deps

  const [races, setRaces] = useState<GridRace[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState<number | null>(null)
  const openRace = useOpenRace()

  useEffect(() => {
    let cancelled = false
    setRaces(null)
    setError(null)
    fetchRaces(season)
      .then((r) => { if (!cancelled) setRaces(r) })
      .catch((e) => { if (!cancelled) setError(e?.message ?? 'Could not load the season.') })
    return () => { cancelled = true }
  }, [season])

  const locked = !isFreeSeason(season) && !pro
  const now = Date.now()
  const cells = races ? seasonGrid(races) : []
  const rounds = cells.filter((c) => !c.cancelled).length
  const offCount = cells.length - rounds

  async function open(r: GridRace) {
    setOpening(r.meeting_key)
    try {
      const race = findRaceSession(await fetchSessions(r.meeting_key))
      if (race) openRace(race.session_key)
      else setError(`${placeOf(r)} has no race session yet.`)
    } catch (e) {
      setError((e as Error)?.message ?? 'Could not open the race.')
    } finally {
      setOpening(null)
    }
  }

  return (
    <section className={ui.section} aria-labelledby="season-title">
      <div className={`${ui.secHead} ${ui.secHeadWide}`} style={{ alignItems: 'center' }}>
        <h2 className={ui.h6} id="season-title">{season} season</h2>
        <span className={ui.sub}>{locked ? 'PRO season: enter an access code in Settings to open these races' : 'Pick a race for the full analysis'}</span>
        <span className={ui.secAside}>
          {races ? `${rounds} grands prix${offCount ? ` · ${offCount} cancelled` : ''}` : ''}
          <Segmented
            small
            label="Season"
            value={String(season)}
            onChange={(v) => { setTouched(true); setSeason(Number(v)) }}
            options={years.map((y) => ({ value: String(y), label: !pro && !isFreeSeason(y) ? `${y} · PRO` : String(y) }))}
          />
        </span>
      </div>
      {error && <div className={ui.empty} style={{ color: 'var(--pw-accent-text)' }} role="alert">{error}</div>}
      {/* Reserve about three rows of cells while the calendar loads, so the grid
          arriving does not push the next section around (CLS). */}
      {!races && !error && <div className={ui.empty} style={{ minHeight: 440 }} aria-busy="true">Loading the calendar…</div>}
      {races && (
        <div className={l.grid}>
          {cells.map(({ race: r, round, place, cancelled }) => {
            const date = new Date(r.date_start).toLocaleDateString([], { day: 'numeric', month: 'short' })
            if (cancelled) {
              // Nothing to open: not a button, not a link, no round number.
              return (
                <div key={r.meeting_key} className={`${l.raceCell} ${l.raceCellOff}`} data-cancelled="true">
                  <span className={l.round}>{date}</span>
                  <span className={l.place}>{place}</span>
                  <span className={l.arrow}>Cancelled</span>
                </div>
              )
            }
            const upcoming = new Date(r.date_start).getTime() > now
            const status = upcoming ? 'Not run yet' : locked ? 'PRO' : opening === r.meeting_key ? 'Opening…' : 'Analyse →'
            return (
              <button
                key={r.meeting_key}
                type="button"
                className={l.raceCell}
                disabled={upcoming || locked || opening === r.meeting_key}
                onClick={() => open(r)}
              >
                <span className={l.round}>
                  {round ? `Round ${String(round).padStart(2, '0')} · ` : ''}
                  {date}
                </span>
                <span className={l.place}>{place}</span>
                <span className={l.arrow}>{status}</span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
