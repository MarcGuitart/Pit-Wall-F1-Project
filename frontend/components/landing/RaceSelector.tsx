'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { fetchRaces, fetchSessions } from '@/lib/api'
import { DEMO_RACES } from '@/lib/constants'
import { PitWallSelect } from '@/components/ui/PitWallSelect'
import type { RaceListItem, SessionInfo } from '@/types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const TELEMETRY_PREFETCH_SESSIONS = new Set([9197, 9539, 9566, 9636, 9662])

const CHAOS_LEVEL = (score: number) => {
  if (score >= 80) return { label: 'Extreme Chaos', color: 'text-signal-red' }
  if (score >= 50) return { label: 'High Chaos', color: 'text-signal-amber' }
  if (score >= 25) return { label: 'Medium Chaos', color: 'text-signal-blue' }
  return { label: 'Low Chaos', color: 'text-signal-green' }
}

const TELEMETRY_SESSIONS = new Set([9197, 9539, 9566, 9636, 9662])

const FEATURED_TAGS: Record<number, { tag: string; tagColor: string; reason: string }> = {
  9636: { tag: 'CHAOS 94', tagColor: 'text-signal-red border-signal-red/40 bg-signal-red/10', reason: '3 safety cars · rain · VSC championship moment' },
  9539: { tag: 'UNDERCUT', tagColor: 'text-signal-purple border-signal-purple/40 bg-signal-purple/10', reason: 'Clean strategic race · pit window showcase' },
  9566: { tag: 'DEGRADATION', tagColor: 'text-signal-amber border-signal-amber/40 bg-signal-amber/10', reason: 'High tyre cliff · degradation-driven outcome' },
}

const SESSION_TYPE_ORDER = ['Race', 'Sprint', 'Qualifying', 'Practice 3', 'Practice 2', 'Practice 1']

const YEAR_OPTIONS = [2025, 2024, 2023].map((y) => ({
  value: String(y),
  label: String(y),
}))

export function RaceSelector() {
  const router = useRouter()
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
        .catch(() => setBackendError('Backend offline — use featured races below'))
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
          const raceSession = sorted.find((s) => s.session_type === 'Race')
          if (raceSession) setSelectedSessionKey(raceSession.session_key)
        })
        .catch((err) => {
          if (err.name !== 'AbortError') setSessions([])
        })
        .finally(() => setLoadingSessions(false))
    }, 300)

    return () => {
      if (sessionDebounceRef.current) clearTimeout(sessionDebounceRef.current)
    }
  }, [selectedMeetingKey])

  const handleAnalyze = useCallback(() => {
    if (selectedSessionKey) router.push(`/race/${selectedSessionKey}`)
  }, [selectedSessionKey, router])

  const canAnalyze = selectedMeetingKey !== null && selectedSessionKey !== null

  const raceOptions = [
    {
      value: '',
      label: loadingRaces ? 'Loading races…' : races.length === 0 ? 'No races available' : 'Select a race…',
      disabled: true,
    },
    ...races.map((r) => ({
      value: String(r.meeting_key),
      label: `${r.meeting_name} — ${r.circuit_short_name ?? ''}`,
    })),
  ]

  return (
    <div className="w-full">
      {/* Selector bar */}
      <div className="bg-bg-panel border border-border-subtle rounded-[4px] p-4 mb-8">
        {backendError && (
          <div className="mb-3 px-3 py-2 bg-signal-amber/10 border border-signal-amber/30 rounded-[3px] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-amber" />
            <span className="font-mono text-[10px] text-signal-amber">{backendError}</span>
          </div>
        )}
        <div className="flex items-end gap-3 flex-wrap">
          {/* Season */}
          <PitWallSelect
            label="Season"
            value={String(year)}
            options={YEAR_OPTIONS}
            onChange={(v) => setYear(Number(v))}
            width="90px"
          />

          {/* Grand Prix — search enabled when options > 8 */}
          <PitWallSelect
            label={loadingRaces ? 'Grand Prix — loading…' : 'Grand Prix'}
            value={selectedMeetingKey ? String(selectedMeetingKey) : ''}
            options={raceOptions}
            onChange={(v) => setSelectedMeetingKey(v ? Number(v) : null)}
            disabled={loadingRaces || races.length === 0}
            width="280px"
          />

          {/* Session pills */}
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-[9px] uppercase tracking-[1.5px] text-text-muted">
              Session
              {loadingSessions && (
                <span className="ml-2 font-normal normal-case tracking-normal text-text-muted">loading…</span>
              )}
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {sessions.length > 0 ? (
                sessions.map((s) => {
                  const isSelected = selectedSessionKey === s.session_key
                  return (
                    <button
                      key={s.session_key}
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
                      className={[
                        'px-2.5 py-1.5 rounded-[3px] font-display font-bold text-[10px] uppercase tracking-[0.5px] transition-all border whitespace-nowrap',
                        isSelected
                          ? 'bg-signal-red/15 border-signal-red text-signal-red'
                          : 'bg-bg-panel border-border-subtle text-text-secondary hover:border-border-default hover:text-text-primary',
                      ].join(' ')}
                    >
                      {s.session_name.replace('Practice ', 'FP').replace('Qualifying', 'QUALI')}
                    </button>
                  )
                })
              ) : selectedMeetingKey && !loadingSessions ? (
                ['Race', 'Qualifying', 'FP3', 'FP2', 'FP1'].map((label) => (
                  <span
                    key={label}
                    className="px-2.5 py-1.5 rounded-[3px] font-display font-bold text-[10px] uppercase tracking-[0.5px] border bg-bg-panel border-border-subtle text-text-muted whitespace-nowrap opacity-50"
                  >
                    {label}
                  </span>
                ))
              ) : (
                <span className="font-mono text-[10px] text-text-muted opacity-50">
                  {selectedMeetingKey ? '' : 'Select a race first'}
                </span>
              )}
            </div>
          </div>

          {/* Analyze button */}
          <button
            onClick={handleAnalyze}
            disabled={!canAnalyze}
            aria-disabled={!canAnalyze}
            className="h-8 px-4 py-0 flex items-center bg-signal-red hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-display font-bold text-[12px] uppercase tracking-[1px] rounded-[3px] transition-all whitespace-nowrap self-end"
          >
            Analyze Race →
          </button>
        </div>
      </div>

      {/* Featured races */}
      <div className="mb-4">
        <h2 className="font-display font-bold text-[10px] uppercase tracking-[1.5px] text-text-secondary mb-3">
          Featured Races
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {DEMO_RACES.map((race) => {
            const chaosInfo = CHAOS_LEVEL(race.chaos_score)
            const featured = FEATURED_TAGS[race.session_key]
            const hasTelemetry = TELEMETRY_SESSIONS.has(race.session_key)
            return (
              <button
                key={race.session_key}
                onClick={() => router.push(`/race/${race.session_key}`)}
                className="bg-bg-panel border border-border-subtle rounded-[4px] p-4 text-left hover:border-border-default hover:bg-bg-elevated transition-all group"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <div className="font-display font-bold text-[13px] uppercase tracking-[0.5px] text-text-primary group-hover:text-white transition-colors">
                        {race.meeting_name}
                      </div>
                      {featured && (
                        <span className={`px-1.5 py-0.5 border rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[0.5px] shrink-0 ${featured.tagColor}`}>
                          {featured.tag}
                        </span>
                      )}
                      {hasTelemetry && (
                        <span className="px-1.5 py-0.5 border border-signal-blue/40 bg-signal-blue/10 rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[0.5px] text-signal-blue shrink-0">
                          ◈ Telemetry
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-text-secondary">
                      {race.circuit_short_name} · {race.year}
                    </div>
                    {featured && (
                      <div className="font-mono text-[9px] text-text-muted mt-0.5">
                        {featured.reason}
                      </div>
                    )}
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <div className={`font-mono font-bold text-[20px] leading-none ${chaosInfo.color}`}>
                      {race.chaos_score}
                    </div>
                    <div className="font-display text-[8px] uppercase tracking-[1px] text-text-muted mt-0.5">
                      Chaos
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-border-subtle flex items-center justify-between">
                  <span className={`font-display font-bold text-[9px] uppercase tracking-[1px] ${chaosInfo.color}`}>
                    {chaosInfo.label}
                  </span>
                  <span className="font-mono text-[10px] text-text-muted group-hover:text-signal-blue transition-colors">
                    Analyze →
                  </span>
                </div>
              </button>
            )
          })}
        </div>
        <p className="mt-3 font-mono text-[9px] text-text-muted">
          Circuit telemetry replay available for{' '}
          <span className="text-signal-blue">◈ highlighted</span> races.{' '}
          For other sessions, follow the{' '}
          <a
            href="https://github.com/MarcGuitart/Pit-Wall-F1-Project#local-setup"
            target="_blank"
            rel="noopener noreferrer"
            className="text-signal-blue hover:underline"
          >
            local setup guide →
          </a>
        </p>
      </div>
    </div>
  )
}
