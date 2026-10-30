'use client'

import { Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { fetchPublished, fetchRaces, fetchSessions, type PublishedIndex } from '@/lib/api'
import { FREE_SEASONS, isFreeSeason } from '@/lib/access'
import { currentSeason, seasonYears } from '@/lib/seasons'
import { meetingState } from '@/lib/sessionStates'
import { MeetingPanel, type PanelData } from './MeetingPanel'
import { seasonGrid, type GridRace } from '@/lib/seasonGrid'
import { weekendLabel } from '@/lib/raceDates'
import { useOpenRace } from '@/lib/raceNav'
import { PAYMENTS_ENABLED } from '@/lib/paymentsFlag'
import { useHasAccess } from '@/lib/openAccess'
import { PageHeader, Segmented, ui } from '@/components/ui'
import l from './landing.module.css'

/**
 * The season as a grid of Grands Prix. A cell opens that meeting's sessions in
 * line under its row (block 33): one panel at a time, fetched when opened and
 * kept per meeting, Escape closes it, the arrow keys move between cells. The
 * cell's own word (Published, Processing, Not run yet, PRO) comes from
 * /published, asked once per page with a 3 s limit. Rounds and names:
 * lib/seasonGrid.ts.
 */

/** How many columns the grid has right now (auto-fill: 6, 3 or 1 by width). */
function useGridColumns(ref: React.RefObject<HTMLDivElement>, ready: boolean): number {
  const [cols, setCols] = useState(1)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setCols(Math.max(1, getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length))
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, ready])
  return cols
}
export function SeasonGrid() {
  const pro = useHasAccess()   // a token, or the open week (block 50)
  const years = seasonYears()
  // A free reader starts on the newest free season, a PRO reader on the current one.
  const [season, setSeason] = useState(() => FREE_SEASONS[FREE_SEASONS.length - 1])
  const [touched, setTouched] = useState(false)
  useEffect(() => { if (pro && !touched) setSeason(years[0]) }, [pro]) // eslint-disable-line react-hooks/exhaustive-deps

  const [races, setRaces] = useState<GridRace[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const openRace = useOpenRace()
  const [published, setPublished] = useState<PublishedIndex | null | undefined>(undefined)
  const [openKey, setOpenKey] = useState<number | null>(null)
  const [panels, setPanels] = useState<Record<number, PanelData>>({})
  const gridRef = useRef<HTMLDivElement>(null)
  const cols = useGridColumns(gridRef, races !== null)

  useEffect(() => {
    let live = true
    fetchPublished(3000).then((p) => { if (live) setPublished(p) })
    return () => { live = false }
  }, [])

  const load = useCallback((meetingKey: number) => {
    setPanels((p) => ({ ...p, [meetingKey]: { status: 'loading' } }))
    fetchSessions(meetingKey)
      .then((sessions) => setPanels((p) => ({ ...p, [meetingKey]: { status: 'ready', sessions } })))
      .catch((e) => setPanels((p) => ({ ...p, [meetingKey]: { status: 'error', message: (e as Error)?.message || 'Could not load the sessions.' } })))
  }, [])

  useEffect(() => {
    let cancelled = false
    setOpenKey(null)
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

  const ctxBase = { now, season, currentSeason: currentSeason(), locked }
  const publishedSet = published ? new Set(published.sessions.map((s) => s.session_key)) : null

  function toggle(r: GridRace) {
    if (openKey === r.meeting_key) { setOpenKey(null); return }
    setOpenKey(r.meeting_key)
    // Cached per meeting: reopening does not fetch again, unless it failed.
    if (!panels[r.meeting_key] || panels[r.meeting_key].status === 'error') load(r.meeting_key)
  }

  function onGridKey(e: KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(gridRef.current?.querySelectorAll<HTMLButtonElement>('button[data-cell]') ?? [])
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    // Escape inside an open popover (Add to calendar) is the popover's alone.
    const from = e.target as HTMLElement
    const inPopover = !!from.closest('[role="dialog"]') || (from.getAttribute('aria-haspopup') === 'dialog' && from.getAttribute('aria-expanded') === 'true')
    if (e.key === 'Escape' && openKey !== null && !inPopover) {
      e.preventDefault()
      const cell = gridRef.current?.querySelector<HTMLButtonElement>(`button[data-cell="${openKey}"]`)
      setOpenKey(null)
      cell?.focus()
      return
    }
    if (i < 0) return
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key]
    if (!step) return
    const next = buttons[i + step]
    if (next) { e.preventDefault(); next.focus() }
  }

  return (
    <>
    <PageHeader
      kicker="Historical"
      title={`Races ${season}`}
      meta={<span>Pick a Grand Prix for its full analysis. Seasons {FREE_SEASONS.join(' and ')} are free.</span>}
    />
    <section className={ui.section} aria-labelledby="season-title">
      <div className={`${ui.secHead} ${ui.secHeadWide}`} style={{ alignItems: 'center' }}>
        <h2 className={ui.h6} id="season-title">{season} season</h2>
        <span className={ui.sub}>{locked ? (PAYMENTS_ENABLED ? 'PRO season: subscribe, or enter an access code in Settings, to open these races' : 'PRO season: subscriptions open soon; an access code in Settings opens these races') : 'Pick a race for the full analysis'}</span>
        <span className={ui.secAside}>
          {races ? `${rounds} grands prix${offCount ? ` · ${offCount} cancelled` : ''}` : ''}
          <Segmented
            small
            label="Season"
            showLabel
            markCurrent
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
        <div className={l.grid} ref={gridRef} onKeyDown={onGridKey}>
          {cells.map(({ race: r, round, place, cancelled }, idx) => {
            // The whole weekend, with its year (block 43): "29 Feb to 2 Mar 2024".
            const date = weekendLabel(r.date_start, r.date_end)
            // The open panel goes after the last cell of its row.
            const openIdx = openKey === null ? -1 : cells.findIndex((c) => c.race.meeting_key === openKey)
            const rowEnd = openIdx < 0 ? -1 : Math.min(cells.length - 1, Math.floor(openIdx / cols) * cols + cols - 1)
            const openCell = openIdx >= 0 ? cells[openIdx] : null
            const panel = idx === rowEnd && openCell ? (
              <MeetingPanel
                key={`panel-${openCell.race.meeting_key}`}
                id={`meeting-panel-${openCell.race.meeting_key}`}
                cellId={`meeting-cell-${openCell.race.meeting_key}`}
                place={openCell.place}
                gpName={openCell.race.meeting_name}
                data={panels[openCell.race.meeting_key] ?? { status: 'loading' }}
                ctx={{ ...ctxBase, published: publishedSet }}
                onRetry={() => load(openCell.race.meeting_key)}
                onOpen={(k, click, label) => openRace(k, { click, label })}
              />
            ) : null
            if (cancelled) {
              // Nothing to open: not a button, not a link, no round number.
              return (
                <Fragment key={r.meeting_key}>
                  <div className={`${l.raceCell} ${l.raceCellOff}`} data-cancelled="true">
                    <span className={l.round}>{date}</span>
                    <span className={l.place}>{place}</span>
                    <span className={l.arrow}>Cancelled</span>
                  </div>
                  {panel}
                </Fragment>
              )
            }
            // undefined: /published has not answered yet; null: it did not in time.
            const st = meetingState(r, published === undefined ? null : published?.sessions ?? null, ctxBase)
            const expanded = openKey === r.meeting_key
            return (
              <Fragment key={r.meeting_key}>
                <button
                  id={`meeting-cell-${r.meeting_key}`}
                  data-cell={r.meeting_key}
                  type="button"
                  className={l.raceCell}
                  aria-expanded={expanded}
                  aria-controls={expanded ? `meeting-panel-${r.meeting_key}` : undefined}
                  onClick={() => toggle(r)}
                >
                  <span className={l.round}>
                    {round ? `Round ${String(round).padStart(2, '0')} · ` : ''}
                    {date}
                  </span>
                  <span className={l.place}>{place}</span>
                  <span className={l.arrow}>{st.label}<span aria-hidden="true">{st.label ? ' ' : ''}{expanded ? '▴' : '▾'}</span></span>
                </button>
                {panel}
              </Fragment>
            )
          })}
        </div>
      )}
    </section>
    </>
  )
}
