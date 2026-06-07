'use client'

import { useState } from 'react'
import type { CrossoverWindow } from '@/types'
import { MethodologyBadge } from '@/components/ui/MethodologyBadge'

type Props = {
  windows: CrossoverWindow[]
  sessionType: string
}

const CONDITION_STYLE: Record<string, { color: string; bg: string }> = {
  DRY:  { color: '#23D18B', bg: 'rgba(35,209,139,0.12)' },
  DAMP: { color: '#FFB020', bg: 'rgba(255,176,32,0.12)' },
  WET:  { color: '#4DA3FF', bg: 'rgba(77,163,255,0.12)' },
}

const IMPACT_STYLE: Record<string, { cls: string }> = {
  High:   { cls: 'text-signal-red border-signal-red/30 bg-signal-red/10' },
  Medium: { cls: 'text-signal-amber border-signal-amber/30 bg-signal-amber/10' },
  Low:    { cls: 'text-text-muted border-border-subtle' },
}

const CONFIDENCE_STYLE: Record<string, string> = {
  High:   'text-signal-green border-signal-green/30',
  Medium: 'text-signal-amber border-signal-amber/30',
  Low:    'text-text-muted border-border-subtle',
}

function ConditionBadge({ condition }: { condition: string }) {
  const style = CONDITION_STYLE[condition] ?? { color: '#8A94A6', bg: 'rgba(138,148,166,0.12)' }
  return (
    <span
      className="px-1.5 py-0.5 rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[0.8px]"
      style={{ color: style.color, background: style.bg, border: `1px solid ${style.color}44` }}
    >
      {condition}
    </span>
  )
}

function DriverChip({ code, tint }: { code: string; tint: 'green' | 'red' }) {
  const cls = tint === 'green'
    ? 'bg-signal-green/10 border-signal-green/30 text-signal-green'
    : 'bg-signal-red/10 border-signal-red/30 text-signal-red'
  return (
    <span className={`px-1.5 py-0.5 border rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[0.5px] ${cls}`}>
      {code}
    </span>
  )
}

function WindowCard({ window: cw }: { window: CrossoverWindow }) {
  return (
    <div className="bg-bg-elevated border border-border-subtle rounded-[3px] p-2.5 space-y-2">
      {/* Top row: transition + lap range + impact */}
      <div className="flex items-center justify-between flex-wrap gap-1.5">
        <div className="flex items-center gap-1.5">
          <ConditionBadge condition={cw.from_condition} />
          <span className="font-mono text-[10px] text-text-muted">→</span>
          <ConditionBadge condition={cw.to_condition} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[9px] text-text-muted">
            Laps {cw.lap_start}–{cw.lap_end}
          </span>
          <span className={`px-1.5 py-0.5 border rounded-[2px] font-display font-bold text-[7px] uppercase tracking-[0.5px] ${IMPACT_STYLE[cw.impact]?.cls ?? ''}`}>
            {cw.impact}
          </span>
        </div>
      </div>

      {/* ⚠ Concurrent SC warning — ALWAYS visible when true */}
      {cw.concurrent_sc && (
        <div className="flex items-start gap-1.5 px-2 py-1.5 bg-signal-amber/10 border border-signal-amber/30 rounded-[2px]">
          <span className="text-signal-amber text-[10px] shrink-0 mt-0.5">⚠</span>
          <span className="font-mono text-[9px] text-signal-amber leading-snug">
            Concurrent SC — attribution mixed. Position gains may reflect SC timing, not tyre choice alone.
          </span>
        </div>
      )}

      {/* Best-timed / late drivers */}
      {(cw.best_timed_drivers.length > 0 || cw.late_drivers.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {cw.best_timed_drivers.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="font-display font-bold text-[7px] uppercase tracking-[0.5px] text-signal-green">
                Best timed
              </span>
              {cw.best_timed_drivers.map((code) => (
                <DriverChip key={code} code={code} tint="green" />
              ))}
            </div>
          )}
          {cw.late_drivers.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="font-display font-bold text-[7px] uppercase tracking-[0.5px] text-signal-red">
                Late
              </span>
              {cw.late_drivers.map((code) => (
                <DriverChip key={code} code={code} tint="red" />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      <p className="font-mono text-[9px] text-text-secondary leading-[1.55]">
        {cw.summary}
      </p>
    </div>
  )
}

export function CrossoverWindowPanel({ windows, sessionType }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (sessionType !== 'Race' || windows.length === 0) return null

  const shown = expanded ? windows : windows.slice(0, 2)
  const hasMore = windows.length > 2

  return (
    <div>
      {/* Sub-header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-display font-bold text-[8px] uppercase tracking-[1px] text-text-muted">
            Crossover Windows
          </span>
          <MethodologyBadge module="crossover" />
        </div>
        <span className="font-mono text-[8px] text-text-muted">
          {windows.length} window{windows.length !== 1 ? 's' : ''} detected
        </span>
      </div>

      <div className="space-y-2">
        {shown.map((cw, i) => (
          <WindowCard key={i} window={cw} />
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 font-mono text-[9px] text-text-muted hover:text-text-secondary transition-colors"
        >
          {expanded ? '▲ Show fewer' : `▼ Show ${windows.length - 2} more window${windows.length - 2 !== 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  )
}
