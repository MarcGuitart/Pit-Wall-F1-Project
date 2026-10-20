'use client'

import { useState } from 'react'
import type { RacePhase } from '@/types'
import { EstimatedLabel } from '@/components/ui/EstimatedLabel'
import { Panel, ui } from '@/components/ui'
import a from './analysis.module.css'

type Props = {
  phases: RacePhase[]
  totalLaps: number
  onPhaseHover?: (phase: RacePhase | null) => void
}

// Phase colour tokens from the backend → design-system colours
const PHASE_INK: Record<string, string> = {
  green:  'var(--pw-green)',
  amber:  'var(--pw-amber)',
  red:    'var(--pw-accent)',
  blue:   'var(--pw-blue)',
  purple: 'var(--pw-purple)',
  muted:  'var(--pw-muted)',
}
const ink = (token: string) => PHASE_INK[token] ?? PHASE_INK.muted
const fill = (token: string) => token === 'muted' ? 'var(--pw-surface-2)' : `color-mix(in srgb, ${ink(token)} 26%, transparent)`

const PHASE_ABBREV: Record<string, string> = {
  'Safety Car Reset':      'SC Reset',
  'VSC Period':            'VSC',
  'Weather Crossover':     'Weather',
  'DRS Train Compression': 'DRS Train',
  'Pit Window':            'Pit Window',
  'Final Push':            'Final Push',
  'Start / Sorting':       'Start',
  'Tyre Management':       'Tyre Mgmt',
  'Degradation Phase':     'Degrad.',
  'Racing':                '',
}

const CHECKER_BG: React.CSSProperties = {
  background: 'repeating-conic-gradient(var(--pw-text) 0 25%, var(--pw-bg) 0 50%) 0 0 / 6px 6px',
}

function lapPct(lap: number, total: number) {
  return Math.min(((lap - 1) / total) * 100, 100)
}

function segWidth(phase: RacePhase, total: number) {
  return ((phase.lap_end - phase.lap_start + 1) / total) * 100
}

const LAP_LABELS = (total: number) => [
  { lap: 1,                        label: 'START' },
  { lap: Math.floor(total * 0.25), label: `L${Math.floor(total * 0.25)}` },
  { lap: Math.floor(total * 0.5),  label: `L${Math.floor(total * 0.5)}` },
  { lap: Math.floor(total * 0.75), label: `L${Math.floor(total * 0.75)}` },
  { lap: total,                    label: `FIN · L${total}` },
]

// Legend items — deduplicated phase types that are NOT "Racing"
function legendItems(phases: RacePhase[]) {
  const seen = new Set<string>()
  return phases.filter((p) => {
    if (p.phase === 'Racing' || seen.has(p.phase)) return false
    seen.add(p.phase)
    return true
  })
}

function PhaseSegment({
  phase,
  totalLaps,
}: {
  phase: RacePhase
  totalLaps: number
}) {
  const [hovered, setHovered] = useState(false)
  const token = phase.color_token
  const left = lapPct(phase.lap_start, totalLaps)
  const width = segWidth(phase, totalLaps)
  const isNarrow = width < 8
  const abbrev = PHASE_ABBREV[phase.phase] ?? phase.phase
  const nearRight = left + width > 80

  return (
    <div
      tabIndex={0}
      role="img"
      aria-label={`${phase.phase}: laps ${phase.lap_start} to ${phase.lap_end} · ${phase.reason}`}
      className={a.phaseSeg}
      style={{ left: `${left}%`, width: `${width}%`, background: fill(token) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      {/* Phase label — only if wide enough */}
      {!isNarrow && abbrev && (
        <span className={a.phaseLabel} style={{ color: ink(token) }}>{abbrev}</span>
      )}

      {/* Tooltip */}
      {hovered && (
        <div
          role="tooltip"
          className={a.phaseTip}
          style={{
            ...(nearRight ? { right: 0 } : { left: '50%', transform: 'translateX(-50%)' }),
            borderLeftColor: ink(token),
          }}
        >
          <div className={a.phaseTipTitle} style={{ color: ink(token) }}>{phase.phase}</div>
          <div className={ui.sub}>Laps {phase.lap_start} to {phase.lap_end} · {phase.reason}</div>
        </div>
      )}
    </div>
  )
}

export function RacePhaseTimeline({ phases, totalLaps }: Props) {
  if (!phases.length || totalLaps < 2) return null

  const labels = LAP_LABELS(totalLaps)
  const legend = legendItems(phases)

  return (
    <Panel title="Race Phase Timeline" aside={<EstimatedLabel />}>
      {/* Track area */}
      <div className={a.phaseTrack}>
        {/* Phase segments */}
        {phases.map((phase, i) => (
          <PhaseSegment key={i} phase={phase} totalLaps={totalLaps} />
        ))}

        {/* Start line */}
        <div className={a.phaseStart} aria-hidden="true" />

        {/* Finish line (checkered) */}
        <div className={a.phaseFinish} style={CHECKER_BG} aria-hidden="true" />
      </div>

      {/* Lap labels */}
      <div className={a.phaseLaps}>
        {labels.map(({ lap, label }, i) => (
          <span
            key={lap}
            style={{
              left: `${Math.min(((lap - 1) / totalLaps) * 100, 100)}%`,
              transform: i === labels.length - 1 ? 'translateX(-100%)' : i === 0 ? 'none' : 'translateX(-50%)',
            }}
          >
            {label}
          </span>
        ))}
      </div>

      {/* Legend */}
      {legend.length > 0 && (
        <div className={`${a.row} ${a.wrap}`} style={{ gap: 14 }}>
          {legend.map((phase) => (
            <span key={phase.phase} className={a.row} style={{ gap: 6 }}>
              <span style={{ width: 12, height: 6, background: ink(phase.color_token), flex: 'none' }} aria-hidden="true" />
              <span className={ui.label}>{PHASE_ABBREV[phase.phase] ?? phase.phase}</span>
            </span>
          ))}
        </div>
      )}
    </Panel>
  )
}
