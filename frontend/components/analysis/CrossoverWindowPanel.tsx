'use client'

import { useState } from 'react'
import type { CrossoverWindow } from '@/types'
import { MethodologyBadge } from '@/components/ui/MethodologyBadge'
import { Badge, toneClass, ui, type Tone } from '@/components/ui'
import a from './analysis.module.css'

type Props = {
  windows: CrossoverWindow[]
  sessionType: string
}

const CONDITION_TONE: Record<string, Tone> = { DRY: 'ok', WET: 'info' }
const IMPACT_TONE: Record<string, Tone> = { High: 'accent', Medium: 'warn', Low: 'muted' }

function WindowCard({ window: cw }: { window: CrossoverWindow }) {
  return (
    <div className={a.subCard}>
      {/* Top row: transition + lap range + impact */}
      <div className={`${a.between} ${a.wrap}`}>
        <span className={a.row}>
          <Badge tone={CONDITION_TONE[cw.from_condition] ?? 'muted'}>{cw.from_condition}</Badge>
          <span className={a.muted} aria-hidden="true">→</span>
          <Badge tone={CONDITION_TONE[cw.to_condition] ?? 'muted'}>{cw.to_condition}</Badge>
        </span>
        <span className={a.row}>
          <span className={ui.sub}>Laps {cw.lap_start} to {cw.lap_end}</span>
          <Badge tone={IMPACT_TONE[cw.impact] ?? 'muted'}>{cw.impact}</Badge>
        </span>
      </div>

      {/* ⚠ Concurrent SC warning — ALWAYS visible when true */}
      {cw.concurrent_sc && (
        <div className={a.warnNote} role="note">
          <span aria-hidden="true">!</span>
          <span>Concurrent SC: attribution mixed. Position gains may reflect SC timing, not tyre choice alone.</span>
        </div>
      )}

      {/* Best-timed / late drivers */}
      {(cw.best_timed_drivers.length > 0 || cw.late_drivers.length > 0) && (
        <div className={`${a.row} ${a.wrap}`} style={{ gap: 12 }}>
          {cw.best_timed_drivers.length > 0 && (
            <span className={`${a.row} ${a.wrap}`}>
              <span className={`${ui.label} ${toneClass('ok')}`}>Best timed</span>
              {cw.best_timed_drivers.map((code) => <Badge key={code} tone="ok">{code}</Badge>)}
            </span>
          )}
          {cw.late_drivers.length > 0 && (
            <span className={`${a.row} ${a.wrap}`}>
              <span className={`${ui.label} ${toneClass('accent')}`}>Late</span>
              {cw.late_drivers.map((code) => <Badge key={code} tone="accent">{code}</Badge>)}
            </span>
          )}
        </div>
      )}

      {/* Summary */}
      <p className={a.para}>{cw.summary}</p>
    </div>
  )
}

export function CrossoverWindowPanel({ windows, sessionType }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (sessionType !== 'Race' || windows.length === 0) return null

  const shown = expanded ? windows : windows.slice(0, 2)
  const hasMore = windows.length > 2

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {/* Sub-header */}
      <div className={a.between}>
        <span className={a.row}>
          <h4 className={ui.h6}>Crossover Windows</h4>
          <MethodologyBadge module="crossover" />
        </span>
        <span className={ui.sub}>{windows.length} window{windows.length !== 1 ? 's' : ''} detected</span>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {shown.map((cw, i) => <WindowCard key={i} window={cw} />)}
      </div>

      {hasMore && (
        <div>
          <button type="button" onClick={() => setExpanded((v) => !v)} className={a.linkBtn} aria-expanded={expanded}>
            {expanded ? '▲ Show fewer' : `▼ Show ${windows.length - 2} more window${windows.length - 2 !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}
    </div>
  )
}
