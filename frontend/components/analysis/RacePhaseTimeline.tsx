'use client'

import { useState } from 'react'
import type { RacePhase } from '@/types'
import { EstimatedLabel } from '@/components/ui/EstimatedLabel'

type Props = {
  phases: RacePhase[]
  totalLaps: number
  onPhaseHover?: (phase: RacePhase | null) => void
}

const PHASE_COLORS: Record<string, string> = {
  green:  'rgba(35,209,139,0.20)',
  amber:  'rgba(255,176,32,0.25)',
  red:    'rgba(232,0,29,0.28)',
  blue:   'rgba(77,163,255,0.22)',
  purple: 'rgba(166,108,255,0.20)',
  muted:  'rgba(37,45,58,0.60)',
}

const PHASE_BORDER: Record<string, string> = {
  green:  'rgba(35,209,139,0.35)',
  amber:  'rgba(255,176,32,0.40)',
  red:    'rgba(232,0,29,0.40)',
  blue:   'rgba(77,163,255,0.35)',
  purple: 'rgba(166,108,255,0.35)',
  muted:  'rgba(37,45,58,0)',
}

const PHASE_TEXT: Record<string, string> = {
  green:  '#23D18B',
  amber:  '#FFB020',
  red:    '#E8001D',
  blue:   '#4DA3FF',
  purple: '#A66CFF',
  muted:  '#4A5568',
}

const PHASE_ABBREV: Record<string, string> = {
  'Safety Car Reset':      'SC Reset',
  'VSC Period':            'VSC',
  'Weather Crossover':     'Weather ↗',
  'DRS Train Compression': 'DRS Train',
  'Pit Window':            'Pit Window',
  'Final Push':            'Final Push',
  'Start / Sorting':       'Start',
  'Tyre Management':       'Tyre Mgmt',
  'Degradation Phase':     'Degrad.',
  'Racing':                '',
}

const CHECKER_BG: React.CSSProperties = {
  backgroundImage: [
    'linear-gradient(45deg, rgba(240,242,245,0.55) 25%, transparent 25%)',
    'linear-gradient(-45deg, rgba(240,242,245,0.55) 25%, transparent 25%)',
    'linear-gradient(45deg, transparent 75%, rgba(240,242,245,0.55) 75%)',
    'linear-gradient(-45deg, transparent 75%, rgba(240,242,245,0.55) 75%)',
  ].join(', '),
  backgroundSize: '4px 4px',
  backgroundPosition: '0 0, 0 2px, 2px -2px, -2px 0px',
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
      style={{
        position: 'absolute',
        left: `${left}%`,
        width: `${width}%`,
        top: 0,
        bottom: 0,
        backgroundColor: PHASE_COLORS[token] ?? PHASE_COLORS.muted,
        borderRight: `1px solid ${PHASE_BORDER[token] ?? 'transparent'}`,
        cursor: 'default',
        overflow: 'visible',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Phase label — only if wide enough */}
      {!isNarrow && abbrev && (
        <span
          style={{
            fontFamily: 'Barlow Condensed, sans-serif',
            fontWeight: 700,
            fontSize: '8px',
            letterSpacing: '0.8px',
            textTransform: 'uppercase',
            color: PHASE_TEXT[token] ?? '#8A94A6',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            maxWidth: '90%',
            textOverflow: 'ellipsis',
            pointerEvents: 'none',
          }}
        >
          {abbrev}
        </span>
      )}

      {/* Tooltip */}
      {hovered && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            ...(nearRight ? { right: 0 } : { left: '50%', transform: 'translateX(-50%)' }),
            background: '#0B0D12',
            border: `1px solid ${PHASE_BORDER[token] ?? '#252D3A'}`,
            borderLeft: `3px solid ${PHASE_TEXT[token] ?? '#8A94A6'}`,
            borderRadius: '3px',
            padding: '5px 8px',
            minWidth: '160px',
            maxWidth: '240px',
            zIndex: 30,
            pointerEvents: 'none',
            whiteSpace: 'normal',
            boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
          }}
        >
          <div
            style={{
              fontFamily: 'Barlow Condensed, sans-serif',
              fontWeight: 700,
              fontSize: '9px',
              letterSpacing: '1px',
              textTransform: 'uppercase',
              color: PHASE_TEXT[token] ?? '#F0F2F5',
              marginBottom: '3px',
            }}
          >
            {phase.phase}
          </div>
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '8px',
              color: '#8A94A6',
              lineHeight: 1.5,
            }}
          >
            Laps {phase.lap_start}–{phase.lap_end} · {phase.reason}
          </div>
          {/* Tooltip arrow */}
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: nearRight ? 'auto' : '50%',
              right: nearRight ? '12px' : 'auto',
              transform: nearRight ? 'none' : 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: `5px solid ${PHASE_BORDER[token] ?? '#252D3A'}`,
            }}
          />
        </div>
      )}
    </div>
  )
}

export function RacePhaseTimeline({ phases, totalLaps, onPhaseHover }: Props) {
  if (!phases.length || totalLaps < 2) return null

  const labels = LAP_LABELS(totalLaps)
  const legend = legendItems(phases)

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Race Phase Timeline
        </span>
        <EstimatedLabel />
      </div>

      <div className="px-3 py-3">
        <div className="relative" style={{ paddingBottom: '4px' }}>
          {/* Track area */}
          <div className="relative" style={{ height: '20px', marginBottom: '6px' }}>
            {/* Base track */}
            <div
              className="absolute inset-0 rounded-[2px]"
              style={{ background: '#111419' }}
            />

            {/* Phase segments */}
            {phases.map((phase, i) => (
              <PhaseSegment key={i} phase={phase} totalLaps={totalLaps} />
            ))}

            {/* Start line */}
            <div
              className="absolute top-0 bottom-0 left-0 rounded-l-[2px]"
              style={{ width: '5px', background: 'rgba(240,242,245,0.22)', zIndex: 5, pointerEvents: 'none' }}
            />
            <div
              className="absolute top-0 bottom-0 left-0"
              style={{ width: '2px', background: 'rgba(240,242,245,0.55)', zIndex: 6, pointerEvents: 'none' }}
            />

            {/* Finish line (checkered) */}
            <div
              className="absolute top-0 bottom-0 right-0 rounded-r-[2px]"
              style={{ width: '10px', zIndex: 5, pointerEvents: 'none', ...CHECKER_BG }}
            />
          </div>

          {/* Lap labels */}
          <div className="relative h-4" style={{ marginBottom: '8px' }}>
            {labels.map(({ lap, label }, i) => (
              <span
                key={lap}
                className="absolute font-mono text-text-muted"
                style={{
                  left: `${Math.min(((lap - 1) / totalLaps) * 100, 100)}%`,
                  fontSize: '8px',
                  transform: i === labels.length - 1
                    ? 'translateX(-100%)'
                    : i === 0 ? 'none' : 'translateX(-50%)',
                }}
              >
                {label}
              </span>
            ))}
          </div>

          {/* Legend */}
          {legend.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              {legend.map((phase) => (
                <div key={phase.phase} className="flex items-center gap-1.5">
                  <div
                    className="rounded-sm"
                    style={{
                      width: 10,
                      height: 4,
                      backgroundColor: PHASE_COLORS[phase.color_token] ?? PHASE_COLORS.muted,
                      border: `1px solid ${PHASE_BORDER[phase.color_token] ?? 'transparent'}`,
                      flexShrink: 0,
                    }}
                  />
                  <span className="font-display font-bold text-[8px] uppercase tracking-[0.5px] text-text-muted">
                    {PHASE_ABBREV[phase.phase] ?? phase.phase}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
