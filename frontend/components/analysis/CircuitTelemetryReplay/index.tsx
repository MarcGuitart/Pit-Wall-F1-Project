'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { FullRaceAnalysis } from '@/types'
import type { TelemetryData } from '@/types/telemetry'
import { getTelemetry } from '@/lib/api'
import type { SelectableDriver } from './DriverSelector'
import { DriverSelector } from './DriverSelector'
import { MetricSelector } from './MetricSelector'
import type { ActiveMetric } from './MetricSelector'
import { TrackReplayMap } from './TrackReplayMap'
import { TelemetryChannels } from './TelemetryChannels'
import { ReplayControls } from './ReplayControls'
import { SectorCards } from './SectorCards'
import { GGDiagram } from './GGDiagram'
import { GForceMeter } from './GForceMeter'

const MAX_FETCH = 5
const MAX_SELECTED = 3
const PLAYBACK_SPEEDS = [0.5, 1, 2, 4] as const
type PlaybackSpeed = typeof PLAYBACK_SPEEDS[number]

type Props = {
  sessionKey: number
  analysis: FullRaceAnalysis
}

export function CircuitTelemetryReplay({ sessionKey, analysis }: Props) {
  const [data, setData] = useState<TelemetryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([])
  const [metric, setMetric] = useState<ActiveMetric>('speed')
  const [progress, setProgress] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1)
  const [hoveredProgress, setHoveredProgress] = useState<number | null>(null)
  const [lapMode, setLapMode] = useState<'fastest_clean' | 'representative'>('fastest_clean')

  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)

  // Top 5 drivers by pace rank to seed the fetch
  const topCodes = useMemo(() => {
    return [...analysis.true_pace]
      .sort((a, b) => a.rank - b.rank)
      .slice(0, MAX_FETCH)
      .map((r) => r.driver_code)
  }, [analysis.true_pace])

  const rankByCode = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of analysis.true_pace) m.set(r.driver_code, r.rank)
    return m
  }, [analysis.true_pace])

  // Fetch when sessionKey or lapMode changes
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setProgress(0)
      setPlaying(false)
      const result = await getTelemetry(sessionKey, topCodes, lapMode)
      if (cancelled) return
      if (result === 'production_unavailable') {
        setError(
          'Circuit telemetry is only available when running locally. Select a featured race for full analysis.',
        )
        setLoading(false)
        return
      }
      if (!result || result.drivers.length === 0) {
        setError('FastF1 telemetry not available for this session.')
        setLoading(false)
        return
      }
      setData(result)
      setSelectedDrivers(result.drivers.slice(0, 1).map((d) => d.driver_code))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, lapMode])

  // Animation loop
  useEffect(() => {
    if (!playing || !data) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      lastTsRef.current = null
      return
    }

    const primaryDriver = data.drivers.find((d) => selectedDrivers[0] === d.driver_code) ?? data.drivers[0]
    if (!primaryDriver?.points.length) return
    const lapTime = Math.max(1, primaryDriver?.lap_time ?? 90)

    const tick = (ts: number) => {
      if (lastTsRef.current == null) { lastTsRef.current = ts }
      const delta = (ts - lastTsRef.current) / 1000
      lastTsRef.current = ts
      setProgress((prev) => {
        const next = prev + (playbackSpeed * delta) / lapTime
        return next >= 1 ? 0 : next
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [playing, data, playbackSpeed, selectedDrivers])

  const toggleDriver = useCallback((code: string) => {
    setSelectedDrivers((prev) => {
      if (prev.includes(code)) {
        if (prev.length === 1) return prev
        return prev.filter((c) => c !== code)
      }
      if (prev.length >= MAX_SELECTED) {
        return [...prev.slice(0, MAX_SELECTED - 1), code]
      }
      return [...prev, code]
    })
  }, [])

  const selectable: SelectableDriver[] = useMemo(() => {
    if (!data) return []
    return data.drivers.map((d) => ({
      code: d.driver_code,
      colour: d.team_colour,
      rank: rankByCode.get(d.driver_code) ?? null,
    }))
  }, [data, rankByCode])

  const selectedTelemetry = useMemo(
    () => (data ? data.drivers.filter((d) => selectedDrivers.includes(d.driver_code)) : []),
    [data, selectedDrivers],
  )

  const primaryLapTime = Math.max(1, selectedTelemetry[0]?.lap_time ?? 90)

  const handleRetry = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await getTelemetry(sessionKey, topCodes)
    if (result === 'production_unavailable') {
      setError(
        'Circuit telemetry is only available when running locally. Select a featured race for full analysis.',
      )
      setLoading(false)
      return
    }
    if (!result || result.drivers.length === 0) {
      setError('FastF1 telemetry not available for this session.')
      setLoading(false)
      return
    }
    setData(result)
    setSelectedDrivers(result.drivers.slice(0, 1).map((d) => d.driver_code))
    setLoading(false)
  }, [sessionKey, topCodes])

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-bg-panel border border-border-subtle rounded-[4px] p-8 flex flex-col items-center justify-center gap-3 min-h-[280px]">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-signal-blue animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
        <div className="text-center">
          <div className="font-display font-bold text-[11px] uppercase tracking-[1.5px] text-text-secondary mb-1">
            Loading Telemetry
          </div>
          <div className="font-mono text-[10px] text-text-muted">
            Fetching FastF1 lap data · First load: 5–15s
          </div>
        </div>
      </div>
    )
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="bg-bg-panel border border-border-subtle rounded-[4px] p-8 flex flex-col items-center justify-center gap-3 min-h-[280px]">
        <div className="font-display font-bold text-[11px] uppercase tracking-[1.5px] text-text-secondary">
          Telemetry Unavailable
        </div>
        <div className="font-mono text-[10px] text-text-muted text-center max-w-sm">
          {error ?? 'FastF1 data not found for this session.'}
        </div>
        <button
          onClick={handleRetry}
          className="mt-1 px-3 py-1.5 rounded-[3px] border border-border-default text-text-secondary hover:border-signal-blue hover:text-signal-blue font-display font-bold text-[10px] uppercase tracking-[1px] transition-all"
        >
          Retry
        </button>
      </div>
    )
  }

  // ── Main view ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* ── Full-width header: drivers · lap · mode · metric ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <DriverSelector
          drivers={selectable}
          selected={selectedDrivers}
          onToggle={toggleDriver}
          max={MAX_SELECTED}
        />
        {/* Lap chip */}
        <div className="flex items-center gap-2 px-2.5 py-1 bg-bg-elevated border border-border-subtle rounded-[3px]">
          <span className="font-display font-bold text-[9px] uppercase tracking-[1px] text-text-muted">Lap</span>
          <span className="font-mono text-[11px] text-text-primary font-bold">
            {selectedTelemetry[0]?.fastest_lap_number
              ? `L${selectedTelemetry[0].fastest_lap_number}`
              : '–'}
          </span>
        </div>
        {/* Lap mode toggle */}
        <div className="flex items-center bg-bg-elevated border border-border-subtle rounded-[3px] p-0.5 gap-0.5">
          {([
            { mode: 'fastest_clean' as const, label: 'Fastest',
              title: 'Fastest clean lap — shows the driver at the absolute limit. Highest G-forces and speed traces.' },
            { mode: 'representative' as const, label: 'Representative',
              title: 'Representative lap — closest to the median race lap time. Shows typical race-pace behaviour; expect lower G-forces during safety car periods.' },
          ]).map(({ mode, label, title }) => (
            <button
              key={mode}
              onClick={() => setLapMode(mode)}
              title={title}
              className={[
                'px-2 py-0.5 rounded-[2px] font-display font-bold text-[9px] uppercase tracking-[0.5px] transition-all',
                lapMode === mode
                  ? 'bg-signal-blue/20 text-signal-blue border border-signal-blue/30'
                  : 'text-text-muted hover:text-text-secondary',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
        <MetricSelector
          active={metric}
          onChange={setMetric}
          multiDriver={selectedDrivers.length > 1}
        />
        <span className="font-mono text-[9px] text-text-muted ml-auto">
          FastF1 · {data.confidence} confidence
        </span>
      </div>

      {/* ── Main 50/50 grid: circuit left · channels right ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" style={{ alignItems: 'stretch' }}>
        {/* Left: circuit map + replay controls anchored to bottom */}
        <section className="min-h-[430px] bg-bg-elevated border border-border-subtle rounded-[4px] overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between shrink-0">
            <span className="font-display font-bold text-[9px] uppercase tracking-[1.5px] text-text-muted">
              Circuit Map · {data.circuit_name}
            </span>
            <span className="font-mono text-[9px] text-text-muted">
              {metric} heatmap
            </span>
          </div>
          <div className="flex-1 min-h-0 p-2">
            <TrackReplayMap
              data={data}
              selectedDrivers={selectedDrivers}
              metric={metric}
              progress={progress}
              hoveredProgress={hoveredProgress}
              onHover={setHoveredProgress}
            />
          </div>
          <div className="p-2 pt-0 shrink-0">
            <ReplayControls
              playing={playing}
              progress={progress}
              lapTime={primaryLapTime}
              playbackSpeed={playbackSpeed}
              onPlayPause={() => setPlaying((p) => !p)}
              onScrub={(p) => { setProgress(p); setPlaying(false) }}
              onSpeedChange={setPlaybackSpeed}
            />
          </div>
        </section>

        {/* Right: telemetry channels + sector cards anchored to bottom */}
        <section className="min-h-[430px] bg-bg-elevated border border-border-subtle rounded-[4px] overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between shrink-0">
            <span className="font-display font-bold text-[9px] uppercase tracking-[1.5px] text-text-muted">
              Telemetry Channels · {selectedTelemetry[0]?.driver_code ?? 'Driver'}
            </span>
            <span className="font-mono text-[9px] text-text-muted">
              L{selectedTelemetry[0]?.fastest_lap_number ?? '–'} fastest
            </span>
          </div>
          <div className="flex-1 min-h-0">
            <TelemetryChannels
              data={data}
              selectedDrivers={selectedDrivers}
              progress={progress}
              hoveredProgress={hoveredProgress}
              onHover={setHoveredProgress}
            />
          </div>
          <div className="p-2 pt-0 shrink-0">
            <SectorCards drivers={selectedTelemetry} />
          </div>
        </section>
      </div>

      {/* ── Bottom row: G-Force meter (50%) · GG diagram (50%) ── */}
      {selectedTelemetry.length === 1 && (
        <div className="grid grid-cols-1 xl:grid-cols-[380px_720px] gap-3 items-start justify-center">
          <GForceMeter driver={selectedTelemetry[0]} progress={progress} />
          <GGDiagram driver={selectedTelemetry[0]} />
        </div>
      )}
    </div>
  )
}
