'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import s from '@/components/live/dashboard/live.module.css'
import p from '@/components/preview/preview.module.css'
import { PreviewShell } from '@/components/preview/PreviewShell'
import { fetchRaces, fetchSessions } from '@/lib/api'
import { findRaceSession } from '@/lib/nextSession'
import { isFreeSeason } from '@/lib/access'
import { fetchNextLiveSession, type NextLiveSessionInfo } from '@/lib/liveStatus'
import { useAccessStore } from '@/stores/accessStore'
import { useLiveStatus } from '@/hooks/useLiveStatus'
import type { RaceListItem } from '@/types'

const SEASONS = [2023, 2024, 2025, 2026]

export default function PreviewHome() {
  const router = useRouter()
  const pro = useAccessStore(st => st.pro)
  const year = new Date().getFullYear()
  const { liveSessionKey } = useLiveStatus(pro, year)
  const [season, setSeason] = useState(year)
  const [races, setRaces] = useState<RaceListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState<number | null>(null)
  const [next, setNext] = useState<NextLiveSessionInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    setRaces(null)
    setError(null)
    fetchRaces(season).then(r => { if (!cancelled) setRaces(r) }).catch(e => { if (!cancelled) setError(e?.message ?? 'Could not load the season.') })
    return () => { cancelled = true }
  }, [season])
  useEffect(() => { fetchNextLiveSession(year).then(setNext).catch(() => undefined) }, [year])

  const locked = !isFreeSeason(season) && !pro
  const now = Date.now()

  async function open(r: RaceListItem) {
    setOpening(r.meeting_key)
    try {
      const race = findRaceSession(await fetchSessions(r.meeting_key))
      if (race) router.push(`/preview/race/${race.session_key}`)
      else setError(`${r.meeting_name} has no race session yet.`)
    } catch (e) {
      setError((e as Error)?.message ?? 'Could not open the race.')
    } finally {
      setOpening(null)
    }
  }

  return (
    <PreviewShell active="historical">
      <header className={s.header}>
        <div style={{ minWidth: 0 }}>
          <div className={s.kicker}><span className={s.square} />Race strategy intelligence · OpenF1 · {season} season</div>
          <h1 className={s.h1}>Pit wall<br />engineer</h1>
          <div className={s.meta}>
            <b>Every race, read like an engineer would.</b>
            <span>True pace, tyre degradation, pit cycles, chaos — measured, never guessed.</span>
          </div>
        </div>
        <div className={s.headRight}>
          <div className={s.seg} aria-label="Season">
            {SEASONS.map(y => (
              <button key={y} className={`${s.segOpt} ${s.segBtn} ${season === y ? s.segOn : ''}`} onClick={() => setSeason(y)} aria-pressed={season === y}>{y}</button>
            ))}
          </div>
          <div className={s.cells} style={{ gridTemplateColumns: 'repeat(2,minmax(150px,1fr))', border: '2px solid var(--pw-divider)' }}>
            <div className={`${s.cell} ${s.cellTight}`}>
              <div className={s.label}>Live now</div>
              {liveSessionKey != null
                ? <button className={s.btn} style={{ marginTop: 6, background: 'var(--pw-accent)', borderColor: 'var(--pw-accent)', color: '#fff', fontWeight: 800 }} onClick={() => router.push(`/live/${liveSessionKey}`)}>Open the pit wall →</button>
                : <div className={s.mid} style={{ fontSize: 22 }}>{pro ? 'No session' : 'PRO only'}</div>}
            </div>
            <div className={`${s.cell} ${s.cellTight}`}>
              <div className={s.label}>Next session</div>
              <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>{next ? `${next.meetingName.replace(' Grand Prix', ' GP')} · ${next.sessionName}` : '—'}</div>
              <div className={s.sub}>{next ? new Date(next.dateStart).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</div>
            </div>
          </div>
        </div>
      </header>

      <section className={s.section} style={{ borderTop: '2px solid var(--pw-divider)' }}>
        <div className={`${s.secHead} ${s.secHeadWide}`}>
          <h6 className={s.h6}>{season} season</h6>
          <span className={s.sub}>{locked ? 'PRO season — enter an access code in Settings to open these races' : 'Pick a race for the full analysis'}</span>
          <span className={s.secAside}>{races ? `${races.length} grands prix` : ''}</span>
        </div>
        {error && <div className={s.empty} style={{ color: 'var(--pw-accent-text)' }}>{error}</div>}
        {!races && !error && <div className={s.empty}>Loading the calendar…</div>}
        {races && (
          <div className={p.raceGrid}>
            {races.map((r, i) => {
              const upcoming = new Date(r.date_start).getTime() > now
              return (
                <button key={r.meeting_key} className={p.raceCell} disabled={upcoming || locked || opening === r.meeting_key} onClick={() => open(r)}>
                  <span className={p.round}>Round {String(i + 1).padStart(2, '0')} · {new Date(r.date_start).toLocaleDateString([], { day: 'numeric', month: 'short' })}</span>
                  <span className={p.raceName}>{r.meeting_name.replace(' Grand Prix', '')}</span>
                  <span className={s.sub}>{r.circuit_short_name} · {r.country_name}</span>
                  <span className={p.arrow}>{upcoming ? 'Not run yet' : locked ? 'PRO' : opening === r.meeting_key ? 'Opening…' : 'Analyse →'}</span>
                </button>
              )
            })}
          </div>
        )}
      </section>
    </PreviewShell>
  )
}
