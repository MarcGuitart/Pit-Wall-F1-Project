'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { placeOf } from '@/lib/place'
import { useOpenRace } from '@/lib/raceNav'
import { fetchRaces, fetchSessions } from '@/lib/api'
import { ApiError } from '@/lib/errors'
import { chaosLevel, CHAOS_LEVEL_TONE } from '@/lib/chaos'
import { DEMO_RACES } from '@/lib/constants'
import { seasonYears } from '@/lib/seasons'
import { ACCESS_CHANGED_EVENT, hasToken, isProSeason } from '@/lib/access'
import { PitWallSelect } from '@/components/ui/PitWallSelect'
import { AddToCalendarButton } from '@/components/ui/AddToCalendarButton'
import { Badge, Banner, buttonClass, toneClass, ui, type Tone } from '@/components/ui'
import l from './landing.module.css'
import type { RaceListItem, SessionInfo } from '@/types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const TELEMETRY_PREFETCH_SESSIONS = new Set([9197, 9539, 9566, 9636, 9662])

const CHAOS_LEVEL = (score: number) => {
  const level = chaosLevel(score)
  return { label: `${level} Chaos`, tone: CHAOS_LEVEL_TONE[level] as Tone }
}

const TELEMETRY_SESSIONS = new Set([9197, 9539, 9566, 9636, 9662])

const FEATURED_TAGS: Record<number, { tag: string; tone: Tone; reason: string }> = {
  9636: { tag: 'CHAOS 73', tone: 'accent', reason: '3 safety cars · rain · VSC championship moment' },
  9539: { tag: 'UNDERCUT', tone: 'purple', reason: 'Clean strategic race · pit window showcase' },
  9566: { tag: 'DEGRADATION', tone: 'warn', reason: 'High tyre cliff · degradation-driven outcome' },
}

const SESSION_TYPE_ORDER = ['Race', 'Sprint', 'Qualifying', 'Practice 3', 'Practice 2', 'Practice 1']

// Current year down to 2023, not a literal list: a hard-coded ceiling meant a
// new season's races existed in the backend and were unreachable from the UI.
//
// PRO seasons stay selectable rather than disabled. The backend is the gate, and
// a reader who picks a locked year is shown what they would be unlocking — which
// is more use than an option that will not respond to a click. The padlock is
// the honest part: it says so before they get there.
const SEASON_YEARS = seasonYears()

function yearOptions(pro: boolean) {
  return SEASON_YEARS.map((y) => ({
    value: String(y),
    label: !pro && isProSeason(y) ? `${y} · PRO` : String(y),
  }))
}

/** basePath: where a chosen session opens — the /preview redesign passes its own. */
export function RaceSelector({ basePath = '/race' }: { basePath?: string } = {}) {
  const openRace = useOpenRace(basePath)
  // Read after mount only: localStorage does not exist during the server render,
  // and assuming "not PRO" there keeps the first paint identical on both sides.
  const [pro, setPro] = useState(false)
  useEffect(() => {
    const sync = () => setPro(hasToken())
    sync()
    window.addEventListener(ACCESS_CHANGED_EVENT, sync)
    return () => window.removeEventListener(ACCESS_CHANGED_EVENT, sync)
  }, [])

  const [year, setYear] = useState<number>(2024)
  const [races, setRaces] = useState<RaceListItem[]>([])
  const [selectedMeetingKey, setSelectedMeetingKey] = useState<number | null>(null)
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [selectedSessionKey, setSelectedSessionKey] = useState<number | null>(null)
  const [loadingRaces, setLoadingRaces] = useState(false)
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [backendError, setBackendError] = useState<string | null>(null)

  const raceDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionAbortRef = useRef<AbortController | null>(null)
  // Track which session keys have already been prefetched to avoid duplicate requests
  const prefetchedRef = useRef<Set<number>>(new Set())

  // Debounced races fetch — 400ms after year changes
  useEffect(() => {
    if (raceDebounceRef.current) clearTimeout(raceDebounceRef.current)

    setRaces([])
    setSelectedMeetingKey(null)
    setSessions([])
    setSelectedSessionKey(null)
    setBackendError(null)

    raceDebounceRef.current = setTimeout(() => {
      setLoadingRaces(true)
      fetchRaces(year)
        .then((data) => setRaces(data))
        .catch((err) => setBackendError(
          err instanceof ApiError ? err.message : 'Backend offline: use the featured races below',
        ))
        .finally(() => setLoadingRaces(false))
    }, 400)

    return () => {
      if (raceDebounceRef.current) clearTimeout(raceDebounceRef.current)
    }
  }, [year])

  // Sessions fetch with AbortController — 300ms debounce
  const sessionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (sessionDebounceRef.current) clearTimeout(sessionDebounceRef.current)
    if (sessionAbortRef.current) sessionAbortRef.current.abort()

    if (!selectedMeetingKey) {
      setSessions([])
      setSelectedSessionKey(null)
      return
    }

    sessionDebounceRef.current = setTimeout(() => {
      const controller = new AbortController()
      sessionAbortRef.current = controller

      setLoadingSessions(true)
      fetchSessions(selectedMeetingKey, controller.signal)
        .then((data) => {
          const sorted = [...data].sort((a, b) => {
            const ai = SESSION_TYPE_ORDER.findIndex((t) => a.session_name.includes(t))
            const bi = SESSION_TYPE_ORDER.findIndex((t) => b.session_name.includes(t))
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
          })
          setSessions(sorted)
          // A cancelled race (only is_cancelled === true) is never the default.
          const raceSession = sorted.find((s) => s.session_type === 'Race' && s.is_cancelled !== true)
          if (raceSession) setSelectedSessionKey(raceSession.session_key)
        })
        .catch((err) => {
          if (err.name === 'AbortError') return
          setSessions([])
          if (err instanceof ApiError) setBackendError(err.message)
        })
        .finally(() => setLoadingSessions(false))
    }, 300)

    return () => {
      if (sessionDebounceRef.current) clearTimeout(sessionDebounceRef.current)
    }
  }, [selectedMeetingKey])

  const handleAnalyze = useCallback(() => {
    if (selectedSessionKey) openRace(selectedSessionKey)
  }, [selectedSessionKey, openRace])

  const canAnalyze = selectedMeetingKey !== null && selectedSessionKey !== null

  const raceOptions = [
    {
      value: '',
      label: loadingRaces ? 'Loading races…' : races.length === 0 ? 'No races available' : 'Select a race…',
      disabled: true,
    },
    ...races.map((r) => ({
      value: String(r.meeting_key),
      label: r.circuit_short_name && r.circuit_short_name !== placeOf(r) ? `${placeOf(r)} · ${r.circuit_short_name}` : placeOf(r),
    })),
  ]

  return (
    <div>
      {backendError && <Banner tone="warn">{backendError}</Banner>}

      {/* Selector bar */}
      <div className={l.selector}>
        <div className={l.selectorRow}>
          {/* Season */}
          <PitWallSelect
            label="Season"
            value={String(year)}
            options={yearOptions(pro)}
            onChange={(v) => setYear(Number(v))}
            width="120px"
          />

          {/* Grand Prix — search enabled when options > 8 */}
          <PitWallSelect
            label={loadingRaces ? 'Grand Prix · loading…' : 'Grand Prix'}
            value={selectedMeetingKey ? String(selectedMeetingKey) : ''}
            options={raceOptions}
            onChange={(v) => setSelectedMeetingKey(v ? Number(v) : null)}
            disabled={loadingRaces || races.length === 0}
            width="min(340px, 100%)"
          />

          {/* Session pills */}
          <div className={l.sessions} role="group" aria-labelledby="session-label">
            <span id="session-label" className={ui.label} style={{ fontWeight: 600 }}>
              Session
              {loadingSessions && <span style={{ marginLeft: 8, textTransform: 'none', letterSpacing: 0 }}>loading…</span>}
            </span>
            <div className={l.pills}>
              {sessions.length > 0 ? (
                sessions.map((s) => {
                  const isSelected = selectedSessionKey === s.session_key
                  const label = s.session_name.replace('Practice ', 'FP').replace('Qualifying', 'QUALI')
                  if (s.is_cancelled === true) {
                    // Nothing to open and nothing to put in a calendar.
                    return (
                      <span key={s.session_key} className={l.pill} data-cancelled="true">
                        <button type="button" disabled className={buttonClass()} aria-label={`${s.session_name} · cancelled`}>
                          {label} · Cancelled
                        </button>
                      </span>
                    )
                  }
                  const isFuture = Boolean(s.date_start && new Date(s.date_start).getTime() > Date.now())
                  const selectedMeeting = races.find((r) => r.meeting_key === selectedMeetingKey)
                  return (
                    <span key={s.session_key} className={l.pill}>
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelectedSessionKey(s.session_key)}
                        onMouseEnter={() => {
                          if (
                            s.session_type === 'Race' &&
                            TELEMETRY_PREFETCH_SESSIONS.has(s.session_key) &&
                            !prefetchedRef.current.has(s.session_key)
                          ) {
                            prefetchedRef.current.add(s.session_key)
                            fetch(
                              `${API_BASE}/telemetry/${s.session_key}?drivers=VER,NOR,PIA,LEC,RUS&lap_mode=fastest_clean`,
                            ).catch(() => {
                              prefetchedRef.current.delete(s.session_key)
                            })
                          }
                        }}
                        className={`${buttonClass()} ${isSelected ? l.pillOn : ''}`}
                      >
                        {label}
                      </button>
                      {isFuture && s.date_start && s.date_end && selectedMeeting && (
                        <AddToCalendarButton
                          variant="system"
                          compact
                          event={{
                            uid: `pitwall-${s.session_key}@pitwallengineer.com`,
                            summary: `Pit Wall · ${placeOf(selectedMeeting)} ${s.session_name}`,
                            description: 'Full strategy analysis on pitwallengineer.com once published.',
                            location: placeOf(selectedMeeting),
                            dateStart: s.date_start,
                            dateEnd: s.date_end,
                          }}
                        />
                      )}
                    </span>
                  )
                })
              ) : selectedMeetingKey && !loadingSessions ? (
                ['Race', 'Qualifying', 'FP3', 'FP2', 'FP1'].map((label) => (
                  <span key={label} className={buttonClass()} style={{ opacity: 0.4, cursor: 'default' }} aria-hidden="true">
                    {label}
                  </span>
                ))
              ) : (
                <span className={l.hint}>{selectedMeetingKey ? '' : 'Select a race first'}</span>
              )}
            </div>
          </div>

          {/* Analyze button */}
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!canAnalyze}
            aria-disabled={!canAnalyze}
            className={buttonClass('primary', true)}
          >
            Analyze Race →
          </button>
        </div>
      </div>

      {/* Featured races */}
      <div className={`${ui.secHead} ${ui.secHeadWide}`} style={{ borderTop: '2px solid var(--pw-divider)' }}>
        <h3 className={ui.h6}>Featured Races</h3>
      </div>
      <div className={l.featured}>
        {DEMO_RACES.map((race) => {
          const chaosInfo = CHAOS_LEVEL(race.chaos_score)
          const featured = FEATURED_TAGS[race.session_key]
          const hasTelemetry = TELEMETRY_SESSIONS.has(race.session_key)
          return (
            <button key={race.session_key} type="button" onClick={() => openRace(race.session_key)} className={l.card}>
              <div className={l.cardTop}>
                <div style={{ minWidth: 0 }}>
                  <div className={l.cardName}>{placeOf(race)}</div>
                  <div className={ui.sub}>{race.circuit_short_name} · {race.year}</div>
                  {featured && <div className={ui.sub}>{featured.reason}</div>}
                  <div className={l.tags}>
                    {featured && <Badge tone={featured.tone}>{featured.tag}</Badge>}
                    {hasTelemetry && <Badge tone="info">◈ Telemetry</Badge>}
                  </div>
                </div>
                <div>
                  <div className={`${l.chaosNum} ${toneClass(chaosInfo.tone)}`}>{race.chaos_score}</div>
                  <div className={ui.label} style={{ textAlign: 'right' }}>Chaos</div>
                </div>
              </div>
              <div className={l.cardFoot}>
                <Badge tone={chaosInfo.tone}>{chaosInfo.label}</Badge>
                <span style={{ fontWeight: 800 }}>Analyze →</span>
              </div>
            </button>
          )
        })}
      </div>
      <p className={l.gridNote} style={{ margin: 0 }}>
        Circuit telemetry replay available for <span style={{ color: 'var(--pw-blue)', fontWeight: 700 }}>◈ highlighted</span> races.{' '}
        For other sessions, follow the{' '}
        <a
          href="https://github.com/MarcGuitart/Pit-Wall-F1-Project#local-setup"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--pw-text)', fontWeight: 700 }}
        >
          local setup guide →
        </a>
      </p>
    </div>
  )
}
