'use client'

import { useState } from 'react'
import { median } from '@/lib/questionsMath'
import q from './questions.module.css'

type Kind = 'clean' | 'pit' | 'sc' | 'outlier'
// Abstract lap heights (taller is slower). No lap time is shown or implied.
const LAPS: { h: number; kind: Kind }[] = [
  { h: 40, kind: 'clean' }, { h: 42, kind: 'clean' }, { h: 78, kind: 'pit' }, { h: 41, kind: 'clean' },
  { h: 70, kind: 'sc' }, { h: 72, kind: 'sc' }, { h: 43, kind: 'clean' }, { h: 60, kind: 'outlier' },
  { h: 42, kind: 'clean' }, { h: 80, kind: 'pit' }, { h: 44, kind: 'clean' }, { h: 41, kind: 'clean' },
]
const CHIPS: { kind: Exclude<Kind, 'clean'>; label: string }[] = [
  { kind: 'pit', label: 'Pit laps' },
  { kind: 'sc', label: 'Safety car laps' },
  { kind: 'outlier', label: 'Outliers' },
]
const H = 96
const W = 240

/** Q1: remove the laps that are not pace, and watch the median settle. */
export function Q1Pace() {
  const [removed, setRemoved] = useState<Record<string, boolean>>({})
  const kept = LAPS.filter((l) => l.kind === 'clean' || !removed[l.kind])
  const m = median(kept.map((l) => l.h)) ?? 0
  const slot = W / LAPS.length
  return (
    <div className={q.demo}>
      <svg viewBox={`0 0 ${W} ${H}`} className={q.svg} role="img" aria-label={`Illustrative laps: ${kept.length} of ${LAPS.length} kept, with their median marked`}>
        {LAPS.map((l, i) => (
          <rect
            key={i}
            className={q.bar}
            data-removed={l.kind !== 'clean' && removed[l.kind] ? 'true' : 'false'}
            data-kind={l.kind}
            x={i * slot + 3}
            y={H - l.h}
            width={slot - 6}
            height={l.h}
            fill={l.kind === 'clean' ? 'currentColor' : 'var(--pw-muted)'}
          />
        ))}
        <g className={q.medianLine} style={{ transform: `translateY(${H - m}px)` }} data-testid="median">
          <line x1="0" x2={W} y1="0" y2="0" stroke="var(--pw-accent)" strokeWidth="2" />
        </g>
      </svg>
      <div className={q.chips} role="group" aria-label="Remove laps that are not pace">
        {CHIPS.map((c) => (
          <button
            key={c.kind}
            type="button"
            className={q.chip}
            aria-pressed={!!removed[c.kind]}
            onClick={() => setRemoved((r) => ({ ...r, [c.kind]: !r[c.kind] }))}
          >
            {removed[c.kind] ? `${c.label} removed` : `Remove ${c.label.toLowerCase()}`}
          </button>
        ))}
      </div>
      <p className={q.readout} aria-live="polite">Median of <b>{kept.length}</b> laps{kept.length === LAPS.filter((l) => l.kind === 'clean').length ? ': clean laps only' : ''}</p>
    </div>
  )
}
