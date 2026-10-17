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
import { Segmented, buttonClass, ui } from '@/components/ui'
import t from './telemetry.module.css'

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
  const [error, setError] = useState<'race_only' | 'not_precomputed' | string | null>(null)
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
      if (result === 'race_only' || result === 'not_precomputed' || result === 'production_unavailable') {
        setError(result)
        setLoading(false)
        return
      }
      if (!result || result.drivers.length === 0) {
        setError('FastF1 telemetry not available for this session.')
        setLoading(false)
        return
      }
      setData(result)
      setSelectedDrivers(result.drivers.slice(0, 1).map((d: { driver_code: string }) => d.driver_code))
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
    if (result === 'race_only' || result === 'not_precomputed' || result === 'production_unavailable') {
      setError(result)
      setLoading(false)
      return
    }
    if (!result || result.drivers.length === 0) {
      setError('FastF1 telemetry not available for this session.')
      setLoading(false)
      return
    }
    setData(result)
    setSelectedDrivers(result.drivers.slice(0, 1).map((d: { driver_code: string }) => d.driver_code))
    setLoading(false)
  }, [sessionKey, topCodes])

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={t.state} aria-busy="true">
        <div className={ui.h6}>Loading Telemetry</div>
        <div className={ui.sub}>Fetching FastF1 lap data · First load: 5–15s</div>
      </div>
    )
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error || !data) {
    const isRaceOnly = error === 'race_only'
    const isNotPrecomputed = error === 'not_precomputed' || error === 'production_unavailable'

    return (
      <div className={t.state}>
        <div className={ui.h6}>Telemetry Unavailable</div>
        <p className={ui.sub} style={{ margin: 0, maxWidth: 420, fontSize: 13, lineHeight: 1.5 }}>
          {isRaceOnly
            ? 'Circuit telemetry is only available for Race sessions.'
            : isNotPrecomputed
              ? "Telemetry for this session hasn't been precomputed yet. To visualise it locally, follow the setup guide in the repository."
              : (error ?? 'FastF1 data not found for this session.')}
        </p>
        {isNotPrecomputed && (
          <a
            href="https://github.com/MarcGuitart/Pit-Wall-F1-Project#local-setup"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--pw-text)', fontWeight: 700, fontSize: 13 }}
          >
            View local setup guide →
          </a>
        )}
        {!isRaceOnly && !isNotPrecomputed && (
          <button type="button" onClick={handleRetry} className={buttonClass('ink')}>Retry</button>
        )}
      </div>
    )
  }

  // ── Main view ─────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Full-width header: drivers · lap · mode · metric ── */}
      <div className={t.controls}>
        <DriverSelector
          drivers={selectable}
          selected={selectedDrivers}
          onToggle={toggleDriver}
          max={MAX_SELECTED}
        />
        {/* Lap chip */}
        <div className={t.group}>
          <span className={ui.label}>Lap</span>
          <b>{selectedTelemetry[0]?.fastest_lap_number ? `L${selectedTelemetry[0].fastest_lap_number}` : '–'}</b>
        </div>
        {/* Lap mode toggle */}
        <Segmented
          small
          label="Lap mode"
          value={lapMode}
          onChange={setLapMode}
          options={[
            { value: 'fastest_clean', label: 'Fastest',
              title: 'Fastest clean lap — shows the driver at the absolute limit. Highest G-forces and speed traces.' },
            { value: 'representative', label: 'Representative',
              title: 'Representative lap — closest to the median race lap time. Shows typical race-pace behaviour; expect lower G-forces during safety car periods.' },
          ]}
        />
        <MetricSelector
          active={metric}
          onChange={setMetric}
          multiDriver={selectedDrivers.length > 1}
        />
        <span className={ui.sub} style={{ marginLeft: 'auto' }}>FastF1 · {data.confidence} confidence</span>
      </div>

      {/* ── Main 50/50 grid: circuit left · channels right ── */}
      <div className={t.grid2}>
        {/* Left: circuit map + replay controls anchored to bottom */}
        <section className={t.pane} aria-label="Circuit map">
          <div className={t.paneHead}>
            <span className={ui.label}>Circuit Map · {data.circuit_name}</span>
            <span className={ui.sub}>{metric} heatmap</span>
          </div>
          <div className={t.paneBody}>
            <TrackReplayMap
              data={data}
              selectedDrivers={selectedDrivers}
              metric={metric}
              progress={progress}
              hoveredProgress={hoveredProgress}
              onHover={setHoveredProgress}
            />
          </div>
          <div className={t.paneFoot}>
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
        <section className={t.pane} aria-label="Telemetry channels">
          <div className={t.paneHead}>
            <span className={ui.label}>Telemetry Channels · {selectedTelemetry[0]?.driver_code ?? 'Driver'}</span>
            <span className={ui.sub}>L{selectedTelemetry[0]?.fastest_lap_number ?? '–'} fastest</span>
          </div>
          <div className={t.paneBody} style={{ padding: 0 }}>
            <TelemetryChannels
              data={data}
              selectedDrivers={selectedDrivers}
              progress={progress}
              hoveredProgress={hoveredProgress}
              onHover={setHoveredProgress}
            />
          </div>
          <div className={t.paneFoot}>
            <SectorCards drivers={selectedTelemetry} />
          </div>
        </section>
      </div>

      {/* ── Bottom row: G-Force meter · GG diagram ── */}
      {selectedTelemetry.length === 1 && (
        <div className={t.bottom}>
          <GForceMeter driver={selectedTelemetry[0]} progress={progress} />
          <GGDiagram driver={selectedTelemetry[0]} />
        </div>
      )}
    </div>
  )
}
