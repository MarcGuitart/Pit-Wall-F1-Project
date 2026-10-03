'use client'

import { useEffect, useMemo, useState } from 'react'
import { RaceLapCharts } from '@/components/charts/LapCharts'
import { fetchLapCharts, type LapChartsPayload } from '@/lib/api'
import type { ChartDriver } from '@/lib/lapCharts'

/**
 * The four lap-by-lap charts for a finished race — the same components and the
 * same computation the live page runs during the session, fed here by the
 * published lap data instead of the SSE snapshot.
 */
export function LapChartsTab({ sessionKey }: { sessionKey: number }) {
  const [data, setData] = useState<LapChartsPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    fetchLapCharts(sessionKey)
      .then(d => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setError(e?.message ?? 'Lap data is not available for this race.') })
    return () => { cancelled = true }
  }, [sessionKey])

  const drivers: ChartDriver[] = useMemo(() => (data?.drivers ?? []).map(d => ({
    number: d.number, code: d.code, colour: d.colour, position: d.position, stints: d.stints,
    laps: d.laps.map(([lap, time, pitOut, pitIn]) => ({ lap, time, pitOut, pitIn })),
  })), [data])

  if (error) {
    return <div className="bg-bg-panel border border-border-subtle px-4 py-8 font-mono text-[11px] text-text-secondary">{error}</div>
  }
  if (!data) {
    return <div className="bg-bg-panel border border-border-subtle px-4 py-8 font-mono text-[11px] text-text-muted">Loading lap data… the first visit to an older race builds it from OpenF1, which takes a few seconds.</div>
  }
  return (
    <div className="border-2 border-border-subtle">
      <RaceLapCharts drivers={drivers} bands={data.bands} totalLaps={data.total_laps} winnerCode={data.winner} idPrefix="race" />
    </div>
  )
}
