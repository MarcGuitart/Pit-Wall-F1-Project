'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchRaces, fetchSessions } from '@/lib/api'
import { DEMO_RACES } from '@/lib/constants'
import type { RaceListItem, SessionInfo } from '@/types'

const CHAOS_LEVEL = (score: number) => {
  if (score >= 80) return { label: 'Extreme Chaos', color: 'text-signal-red' }
  if (score >= 50) return { label: 'High Chaos', color: 'text-signal-amber' }
  if (score >= 25) return { label: 'Medium Chaos', color: 'text-signal-blue' }
  return { label: 'Low Chaos', color: 'text-signal-green' }
}

const SESSION_TYPE_ORDER = ['Race', 'Sprint', 'Qualifying', 'Practice 3', 'Practice 2', 'Practice 1']

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

  // Load races when year changes
  useEffect(() => {
    let cancelled = false
    setLoadingRaces(true)
    setRaces([])
    setSelectedMeetingKey(null)
    setSessions([])
    setSelectedSessionKey(null)
    setBackendError(null)

    fetchRaces(year)
      .then((data) => {
        if (!cancelled) setRaces(data)
      })
      .catch(() => {
        if (!cancelled) setBackendError('Backend offline — using demo races')
      })
      .finally(() => {
        if (!cancelled) setLoadingRaces(false)
      })

    return () => { cancelled = true }
  }, [year])

  // Load sessions when meeting changes
  useEffect(() => {
    if (!selectedMeetingKey) {
      setSessions([])
      setSelectedSessionKey(null)
      return
    }
    let cancelled = false
    setLoadingSessions(true)

    fetchSessions(selectedMeetingKey)
      .then((data) => {
        if (!cancelled) {
          const sorted = [...data].sort((a, b) => {
            const ai = SESSION_TYPE_ORDER.findIndex((t) => a.session_name.includes(t))
            const bi = SESSION_TYPE_ORDER.findIndex((t) => b.session_name.includes(t))
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
          })
          setSessions(sorted)
          // Auto-select Race session
          const raceSession = sorted.find((s) => s.session_type === 'Race')
          if (raceSession) setSelectedSessionKey(raceSession.session_key)
        }
      })
      .catch(() => {
        if (!cancelled) setSessions([])
      })
      .finally(() => {
        if (!cancelled) setLoadingSessions(false)
      })

    return () => { cancelled = true }
  }, [selectedMeetingKey])

  const handleAnalyze = () => {
    const key = selectedSessionKey
    if (key) router.push(`/race/${key}`)
  }

  const handleDemoRace = (sessionKey: number) => {
    router.push(`/race/${sessionKey}`)
  }

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
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-[9px] uppercase tracking-[1.5px] text-text-muted">
              Season
            </label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="bg-bg-elevated border border-border-default text-text-primary font-mono text-[12px] px-3 py-2 rounded-[3px] focus:outline-none focus:border-signal-blue min-w-[90px]"
            >
              {[2025, 2024, 2023, 2022].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Grand Prix */}
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="font-display font-bold text-[9px] uppercase tracking-[1.5px] text-text-muted">
              Grand Prix
              {loadingRaces && (
                <span className="ml-2 text-text-muted normal-case tracking-normal">loading…</span>
              )}
            </label>
            <select
              value={selectedMeetingKey ?? ''}
              onChange={(e) => setSelectedMeetingKey(e.target.value ? Number(e.target.value) : null)}
              className="bg-bg-elevated border border-border-default text-text-primary font-mono text-[12px] px-3 py-2 rounded-[3px] focus:outline-none focus:border-signal-blue"
              disabled={loadingRaces || races.length === 0}
            >
              <option value="">
                {loadingRaces ? 'Loading races…' : races.length === 0 ? 'No races (backend offline)' : 'Select a race…'}
              </option>
              {races.map((r) => (
                <option key={r.meeting_key} value={r.meeting_key}>
                  {r.meeting_name} — {r.circuit_short_name}
                </option>
              ))}
            </select>
          </div>

          {/* Session chips */}
          <div className="flex flex-col gap-1">
            <label className="font-display font-bold text-[9px] uppercase tracking-[1.5px] text-text-muted">
              Session
              {loadingSessions && (
                <span className="ml-2 text-text-muted normal-case tracking-normal">loading…</span>
              )}
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {sessions.length > 0
                ? sessions.map((s) => (
                    <button
                      key={s.session_key}
                      onClick={() => setSelectedSessionKey(s.session_key)}
                      className={`px-2.5 py-1.5 rounded-[3px] font-display font-bold text-[10px] uppercase tracking-[0.5px] transition-all border ${
                        selectedSessionKey === s.session_key
                          ? 'bg-signal-red border-signal-red text-white'
                          : 'border-border-subtle text-text-secondary hover:border-border-default hover:text-text-primary'
                      }`}
                    >
                      {s.session_name.replace('Practice ', 'FP').replace('Qualifying', 'QUALI')}
                    </button>
                  ))
                : ['RACE', 'QUALI', 'FP3', 'FP2', 'FP1'].map((label) => (
                    <div
                      key={label}
                      className="px-2.5 py-1.5 rounded-[3px] border border-border-subtle text-text-muted font-display font-bold text-[10px] uppercase opacity-40"
                    >
                      {label}
                    </div>
                  ))}
            </div>
          </div>

          {/* Analyze button */}
          <button
            onClick={handleAnalyze}
            disabled={!selectedSessionKey}
            className="px-6 py-2 bg-signal-red hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-display font-bold text-[12px] uppercase tracking-[1px] rounded-[3px] transition-all whitespace-nowrap self-end mb-[1px]"
          >
            Analyze →
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
            return (
              <button
                key={race.session_key}
                onClick={() => handleDemoRace(race.session_key)}
                className="bg-bg-panel border border-border-subtle rounded-[4px] p-4 text-left hover:border-border-default hover:bg-bg-elevated transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-display font-bold text-[13px] uppercase tracking-[0.5px] text-text-primary group-hover:text-white transition-colors">
                      {race.meeting_name}
                    </div>
                    <div className="font-mono text-[11px] text-text-secondary mt-0.5">
                      {race.circuit_short_name} · {race.year}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-mono font-bold text-[20px] leading-none ${chaosInfo.color}`}>
                      {race.chaos_score}
                    </div>
                    <div className="font-display text-[8px] uppercase tracking-[1px] text-text-muted mt-0.5">
                      Chaos
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {race.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 bg-bg-elevated border border-border-subtle rounded-[2px] font-display font-bold text-[9px] uppercase tracking-[0.5px] text-text-secondary"
                    >
                      {tag}
                    </span>
                  ))}
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
      </div>
    </div>
  )
}
