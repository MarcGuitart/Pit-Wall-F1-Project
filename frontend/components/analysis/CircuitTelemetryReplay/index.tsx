'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { FullRaceAnalysis } from '@/types'
import type { TelemetryData } from '@/types/telemetry'
import { getTelemetry, type TelemetryResult } from '@/lib/api'
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
  // null while loading or once data is in; otherwise why there is none (block 32, task 7)
  const [problem, setProblem] = useState<Exclude<TelemetryResult, { kind: 'data' }> | null>(null)
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

  // One loader for the first fetch, a lap-mode change and Retry.
  const load = useCallback(async (isCancelled: () => boolean = () => false) => {
    setLoading(true)
    setProblem(null)
    setProgress(0)
    setPlaying(false)
    const result = await getTelemetry(sessionKey, topCodes, lapMode)
    if (isCancelled()) return
    if (result.kind === 'data') {
      setData(result.data)
      setSelectedDrivers(result.data.drivers.slice(0, 1).map((d: { driver_code: string }) => d.driver_code))
    } else {
      setData(null)
      setProblem(result)
    }
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, lapMode])

  // Fetch when sessionKey or lapMode changes
  useEffect(() => {
    let cancelled = false
    load(() => cancelled)
    return () => { cancelled = true }
  }, [load])

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

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={t.state} aria-busy="true" data-telemetry-panel="loading">
        <div className={ui.h6}>Loading Telemetry</div>
        <div className={ui.sub}>Fetching FastF1 lap data · First load: 5 to 15s</div>
      </div>
    )
  }

  // ── No telemetry: a permanent fact, or an error worth one more try ─────────
  if (problem || !data) {
    const reason = problem?.kind === 'unavailable' ? problem.reason : null
    const text = reason === 'race_only'
      ? 'Circuit telemetry is only available for race sessions.'
      : reason === 'not_prepared'
        ? 'Telemetry for this race has not been prepared, so there is nothing to replay.'
        : reason === 'no_data'
          ? 'FastF1 has no telemetry for this session.'
          : 'The analysis server did not answer, so the telemetry could not be loaded.'
    return (
      <div className={t.state} data-telemetry-panel={reason ? 'unavailable' : 'error'}>
        <div className={ui.h6}>{reason ? 'Telemetry not available' : 'Telemetry did not load'}</div>
        <p className={ui.sub} style={{ margin: 0, maxWidth: 420, fontSize: 13, lineHeight: 1.5 }}>{text}</p>
        {!reason && <button type="button" onClick={() => load()} className={buttonClass('ink')}>Retry</button>}
      </div>
    )
  }

  // ── Main view ─────────────────────────────────────────────────────────────
  return (
    <div data-telemetry-panel="data">
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
          <b>{selectedTelemetry[0]?.fastest_lap_number ? `L${selectedTelemetry[0].fastest_lap_number}` : 'n/a'}</b>
        </div>
        {/* Lap mode toggle */}
        <Segmented
          small
          label="Lap mode"
          value={lapMode}
          onChange={setLapMode}
          options={[
            { value: 'fastest_clean', label: 'Fastest',
              title: 'Fastest clean lap: shows the driver at the absolute limit. Highest G-forces and speed traces.' },
            { value: 'representative', label: 'Representative',
              title: 'Representative lap: closest to the median race lap time. Shows typical race-pace behaviour; expect lower G-forces during safety car periods.' },
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
            <span className={ui.sub}>L{selectedTelemetry[0]?.fastest_lap_number ?? 'n/a'} fastest</span>
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
