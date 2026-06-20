'use client'

import { useState, useCallback, useMemo } from 'react'
import type { FullRaceAnalysis } from '@/types'
import type { TelemetryData, TelemetryMetric } from '@/types/telemetry'
import { getTelemetry } from '@/lib/api'
import { TrackMap } from './TrackMap'
import { TelemetryChart } from './TelemetryChart'
import { DriverSelector, type SelectableDriver } from './DriverSelector'
import { MetricSelector } from './MetricSelector'
import { SectorInfo } from './SectorInfo'
import { metricLegend } from './colors'

type Props = {
  sessionKey: number
  analysis: FullRaceAnalysis
}

const MAX_SELECTED = 3
const MAX_FETCH = 5

export function CircuitViewPanel({ sessionKey, analysis }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<TelemetryData | null>(null)
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([])
  const [metric, setMetric] = useState<TelemetryMetric>('SPEED')
  const [hoveredDistance, setHoveredDistance] = useState<number | null>(null)
  const [highlightRange, setHighlightRange] = useState<{ start: number; end: number } | null>(null)

  // Top drivers by pace ranking — used to seed the FastF1 fetch
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

  const colourByCode = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of analysis.true_pace) {
      m.set(r.driver_code, `#${(r.team_colour ?? 'FFFFFF').replace('#', '')}`)
    }
    return m
  }, [analysis.true_pace])

  const loadDrivers = useCallback(async (codes: string[]) => {
    if (loading) return
    setLoading(true)
    setError(null)
    const requested = codes.slice(0, MAX_SELECTED)
    const result = await getTelemetry(sessionKey, requested)
    if (!result || result.drivers.length === 0) {
      setError('Telemetry is not available for this session.')
      setLoading(false)
      return
    }
    setData(result)
    setSelectedDrivers(result.drivers.slice(0, MAX_SELECTED).map((d) => d.driver_code))
    setLoading(false)
  }, [sessionKey, loading])

  const handleExpand = useCallback(async () => {
    setExpanded(true)
    if (data || loading) return
    await loadDrivers(topCodes.slice(0, MAX_SELECTED))
  }, [topCodes, data, loading, loadDrivers])

  const toggleDriver = useCallback(async (code: string) => {
    let nextDrivers: string[] = []
    setSelectedDrivers((prev) => {
      if (prev.includes(code)) {
        // Don't allow deselecting the last remaining driver
        nextDrivers = prev.length === 1 ? prev : prev.filter((c) => c !== code)
        return nextDrivers
      }
      if (prev.length >= MAX_SELECTED) {
        // Drop the last selected, add the new one
        nextDrivers = [...prev.slice(0, MAX_SELECTED - 1), code]
        return nextDrivers
      }
      nextDrivers = [...prev, code]
      return nextDrivers
    })

    const hasAll = nextDrivers.every((selected) => data?.drivers.some((d) => d.driver_code === selected))
    if (!hasAll) {
      await loadDrivers(nextDrivers)
    }
  }, [data, loadDrivers])

  const selectable: SelectableDriver[] = useMemo(() => {
    return analysis.true_pace.map((d) => ({
      code: d.driver_code,
      colour: colourByCode.get(d.driver_code) ?? '#FFFFFF',
      rank: rankByCode.get(d.driver_code) ?? null,
    }))
  }, [analysis.true_pace, colourByCode, rankByCode])

  const selectedTelemetry = useMemo(
    () => (data ? data.drivers.filter((d) => selectedDrivers.includes(d.driver_code)) : []),
    [data, selectedDrivers],
  )

  const isRaceTrace = data?.source.toLowerCase().includes('openf1') ?? false

  // ── Collapsed ─────────────────────────────────────────────────────────────
  if (!expanded) {
    return (
      <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
        <div className="px-3 py-2 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
              Circuit Telemetry
            </span>
            <span className="font-mono text-[9px] text-text-muted mt-0.5">
              Driver inputs · full-race traces
            </span>
          </div>
          <button
            onClick={handleExpand}
            className="px-3 py-1.5 rounded-[3px] border border-border-default text-text-secondary hover:border-signal-blue hover:text-signal-blue font-display font-bold text-[10px] uppercase tracking-[1px] transition-all"
          >
            ▶ Open
          </button>
        </div>
      </div>
    )
  }

  // ── Expanded ──────────────────────────────────────────────────────────────
  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
            Circuit Telemetry
          </span>
          {data && (
            <span className="font-mono text-[9px] text-text-muted">
              {data.circuit_name} {data.year} · {data.source}
            </span>
          )}
        </div>
        <button
          onClick={() => setExpanded(false)}
          className="px-2 py-1 rounded-[3px] text-text-muted hover:text-text-primary font-display font-bold text-[10px] uppercase tracking-[1px] transition-colors"
        >
          ▼ Close
        </button>
      </div>

      <div className="p-3">
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-signal-blue animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
            <span className="font-mono text-[10px] text-text-secondary">
              Loading telemetry from FastF1…
            </span>
            <span className="font-mono text-[9px] text-text-muted">
              First load can take 5–20 seconds
            </span>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <span className="font-display font-bold text-[12px] uppercase tracking-[1px] text-text-secondary">
              Telemetry Unavailable
            </span>
            <span className="font-mono text-[10px] text-text-muted text-center max-w-md">
              {error}
            </span>
            <button
              onClick={() => {
                setError(null)
                setData(null)
                loadDrivers(selectedDrivers.length ? selectedDrivers : topCodes.slice(0, MAX_SELECTED))
              }}
              className="mt-1 px-3 py-1.5 rounded-[3px] border border-border-default text-text-secondary hover:border-signal-blue hover:text-signal-blue font-display font-bold text-[10px] uppercase tracking-[1px] transition-all"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && data && (
          <div className="space-y-3">
            <DriverSelector
              drivers={selectable}
              selected={selectedDrivers}
              onToggle={toggleDriver}
              max={MAX_SELECTED}
            />
            <MetricSelector
              active={metric}
              onChange={setMetric}
              multiDriver={selectedDrivers.length > 1}
            />

            {!isRaceTrace && (
              <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-3">
                <div>
                  <TrackMap
                    data={data}
                    selectedDrivers={selectedDrivers}
                    metric={metric}
                    hoveredDistance={hoveredDistance}
                    onHover={setHoveredDistance}
                  />
                  {/* Metric legend (single-driver mode only) */}
                  {selectedDrivers.length === 1 && (
                    <div className="flex items-center gap-3 mt-1.5 px-1">
                      {metricLegend(metric).map((l) => (
                        <div key={l.label} className="flex items-center gap-1">
                          <span className="w-2.5 h-1.5 rounded-sm" style={{ backgroundColor: l.colour }} />
                          <span className="font-mono text-[8px] text-text-muted">{l.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <SectorInfo
                  drivers={selectedTelemetry}
                  onHoverSector={setHighlightRange}
                  sectorBoundaries={data.sector_boundaries}
                  totalDistance={data.total_distance}
                />
              </div>
            )}

            {isRaceTrace && (
              <div className="rounded-[3px] border border-border-subtle bg-bg-secondary px-3 py-2">
                <div className="font-display font-bold text-[10px] uppercase tracking-[1px] text-text-secondary">
                  Full Race Driver Inputs
                </div>
                <div className="mt-1 font-mono text-[9px] text-text-muted">
                  Brake and throttle traces from OpenF1 car_data. X-axis is race time; hover the chart to inspect lap, speed, throttle, brake and gear.
                </div>
              </div>
            )}

            {/* Telemetry traces */}
            <TelemetryChart
              data={data}
              selectedDrivers={selectedDrivers}
              hoveredDistance={hoveredDistance}
              onHover={setHoveredDistance}
              highlightRange={highlightRange}
            />
          </div>
        )}
      </div>
    </div>
  )
}
