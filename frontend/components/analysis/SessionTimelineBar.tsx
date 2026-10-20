'use client'

import { useState } from 'react'
import type { EngineerNote, PitImpactRow, ChaosIndex } from '@/types'
import { EstimatedLabel } from '@/components/ui/EstimatedLabel'
import { Panel, ui } from '@/components/ui'
import a from './analysis.module.css'

type SessionTimelineBarProps = {
  totalLaps: number
  sessionType: string
  engineerNotes: EngineerNote[]
  pitEvents: PitImpactRow[]
  chaosIndex: ChaosIndex
}

type Segment = { startPct: number; endPct: number; type: 'racing' | 'sc' | 'vsc' }

function lapPct(lap: number, total: number) {
  return Math.min((lap / total) * 100, 100)
}

function parseSCSegments(notes: EngineerNote[], total: number): Segment[] {
  const deployments = notes
    .filter((n) => n.type === 'CHAOS' && n.lap_number != null)
    .map((n) => ({ lap: n.lap_number!, isVSC: n.title.toLowerCase().includes('vsc') }))
    .sort((a, b) => a.lap - b.lap)

  const segments: Segment[] = []
  let lastEnd = 0
  for (const d of deployments) {
    const start = d.lap
    const end = Math.min(d.lap + 6, total)
    if (start > lastEnd)
      segments.push({ startPct: lapPct(lastEnd, total), endPct: lapPct(start, total), type: 'racing' })
    segments.push({ startPct: lapPct(start, total), endPct: lapPct(end, total), type: d.isVSC ? 'vsc' : 'sc' })
    lastEnd = end
  }
  if (lastEnd < total)
    segments.push({ startPct: lapPct(lastEnd, total), endPct: 100, type: 'racing' })
  if (segments.length === 0)
    segments.push({ startPct: 0, endPct: 100, type: 'racing' })
  return segments
}

// SC amber, VSC accent — the original pairing, kept.
const SEGMENT_COLORS = {
  racing: 'color-mix(in srgb, var(--pw-green) 18%, transparent)',
  sc:     'color-mix(in srgb, var(--pw-amber) 34%, transparent)',
  vsc:    'color-mix(in srgb, var(--pw-accent) 30%, transparent)',
}
const PIT_INK = 'var(--pw-muted)'
const SC_INK = 'var(--pw-amber)'
const VSC_INK = 'var(--pw-accent)'
const PEAK_INK = 'var(--pw-purple)'

// Checkered flag pattern for finish line
const CHECKER_BG: React.CSSProperties = {
  background: 'repeating-conic-gradient(var(--pw-text) 0 25%, var(--pw-bg) 0 50%) 0 0 / 6px 6px',
}

// ── Rich tooltip card ────────────────────────────────────────────────────────

type TooltipCardProps = {
  type: 'sc' | 'vsc' | 'pit' | 'peak'
  lap: number
  color: string
  label: string
  detail?: string
}

function TooltipCard({ type, lap, color, label, detail }: TooltipCardProps) {
  const icon = type === 'sc' || type === 'vsc' ? '!' : type === 'pit' ? '■' : '↑'
  return (
    <div className={a.markTip} style={{ borderLeftColor: color }}>
      <div className={a.row} style={{ gap: 6 }}>
        <span style={{ color }} aria-hidden="true">{icon}</span>
        <span className={a.phaseTipTitle} style={{ color, margin: 0 }}>{label}</span>
      </div>
      <div className={ui.small}>LAP {lap}</div>
      {detail && <div className={ui.sub} style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{detail}</div>}
    </div>
  )
}

// ── Interactive marker with wide hit area ────────────────────────────────────

type MarkerProps = {
  pct: number
  barColor: string
  barWidth?: number
  zIndex?: number
  dimmed?: boolean
  label: string
  tooltip: React.ReactNode
}

function Marker({ pct, barColor, barWidth = 2, zIndex = 2, dimmed = false, label, tooltip }: MarkerProps) {
  const [hovered, setHovered] = useState(false)
  // Clamp tooltip alignment for markers near edges
  const alignRight = pct > 85

  return (
    <div
      tabIndex={0}
      role="img"
      aria-label={label}
      className={a.marker}
      style={{ left: `${pct}%`, zIndex }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      {/* Actual visible bar — thin, centered within hit area */}
      <div style={{ width: barWidth, height: '100%', background: barColor, opacity: hovered ? 1 : (dimmed ? 0.55 : 1), flexShrink: 0 }} />

      {hovered && (
        <div role="tooltip" style={{ position: 'absolute', bottom: 'calc(100% + 8px)', ...(alignRight ? { right: 0 } : { left: '50%', transform: 'translateX(-50%)' }) }}>
          {tooltip}
        </div>
      )}
    </div>
  )
}

// ── Lap labels ───────────────────────────────────────────────────────────────

const LAP_LABEL_POSITIONS = (total: number) => [
  { lap: 1,                        label: 'L1' },
  { lap: Math.floor(total * 0.25), label: `L${Math.floor(total * 0.25)}` },
  { lap: Math.floor(total * 0.5),  label: `L${Math.floor(total * 0.5)}` },
  { lap: Math.floor(total * 0.75), label: `L${Math.floor(total * 0.75)}` },
  { lap: total,                    label: `L${total}` },
]

// ── Main component ────────────────────────────────────────────────────────────

export function SessionTimelineBar({
  totalLaps, sessionType, engineerNotes, pitEvents, chaosIndex,
}: SessionTimelineBarProps) {
  if (totalLaps < 2) return null

  if (sessionType !== 'Race') {
    return (
      <Panel title="Session Timeline" aside={<EstimatedLabel />}>
        <div className={a.phaseTrack} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 0 }}>
          <span className={ui.sub}>Timeline · {sessionType} session</span>
        </div>
      </Panel>
    )
  }

  const segments = parseSCSegments(engineerNotes, totalLaps)
  const labels = LAP_LABEL_POSITIONS(totalLaps)

  const pitMarkers = pitEvents
    .filter((p) => p.lap_number != null)
    .map((p) => ({
      pct: lapPct(p.lap_number, totalLaps),
      driverCode: p.driver_code,
      laneDuration: p.lane_duration,
      lap: p.lap_number,
    }))

  const scMarkers = engineerNotes
    .filter((n) => n.type === 'CHAOS' && n.lap_number != null)
    .map((n) => ({
      pct: lapPct(n.lap_number!, totalLaps),
      isVSC: n.title.toLowerCase().includes('vsc'),
      lap: n.lap_number!,
      message: n.message.length > 70 ? n.message.slice(0, 70) + '…' : n.message,
    }))

  const peakPct = chaosIndex.peak_chaos_lap != null
    ? lapPct(chaosIndex.peak_chaos_lap, totalLaps)
    : null

  return (
    <Panel title="Race Timeline" aside={<EstimatedLabel />}>
      {/* ── Track area ── */}
      <div className={a.phaseTrack}>
        {/* Segment fills */}
        {segments.map((seg, i) => (
          <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${seg.startPct}%`, width: `${seg.endPct - seg.startPct}%`, background: SEGMENT_COLORS[seg.type] }} />
        ))}

        <div className={a.phaseStart} aria-hidden="true" />
        <div className={a.phaseFinish} style={CHECKER_BG} aria-hidden="true" />

        {/* ── Pit stop markers ── */}
        {pitMarkers.map((m, i) => (
          <Marker
            key={`pit-${i}`}
            pct={m.pct}
            barColor={PIT_INK}
            barWidth={1}
            zIndex={7}
            dimmed
            label={`${m.driverCode} pit stop, lap ${m.lap}`}
            tooltip={<TooltipCard type="pit" lap={m.lap} color="var(--pw-text)" label={`${m.driverCode} pit stop`} detail={m.laneDuration ? `Lane: ${m.laneDuration.toFixed(1)}s` : undefined} />}
          />
        ))}

        {/* ── SC/VSC markers ── */}
        {scMarkers.map((m, i) => (
          <Marker
            key={`sc-${i}`}
            pct={m.pct}
            barColor={m.isVSC ? VSC_INK : SC_INK}
            zIndex={8}
            label={`${m.isVSC ? 'Virtual Safety Car' : 'Safety Car'}, lap ${m.lap}`}
            tooltip={<TooltipCard type={m.isVSC ? 'vsc' : 'sc'} lap={m.lap} color={m.isVSC ? VSC_INK : SC_INK} label={m.isVSC ? 'Virtual Safety Car' : 'Safety Car'} detail={m.message || undefined} />}
          />
        ))}

        {/* ── Peak chaos marker ── */}
        {peakPct != null && (
          <Marker
            pct={peakPct}
            barColor={PEAK_INK}
            zIndex={9}
            label={`Peak chaos lap ${chaosIndex.peak_chaos_lap}`}
            tooltip={<TooltipCard type="peak" lap={chaosIndex.peak_chaos_lap!} color={PEAK_INK} label="Peak chaos lap" detail={`Chaos score: ${chaosIndex.score} · ${chaosIndex.level}`} />}
          />
        )}
      </div>

      {/* ── Lap labels row ── */}
      <div className={a.phaseLaps}>
        {labels.map(({ lap, label }, i) => (
          <span key={lap} style={{ left: `${lapPct(lap, totalLaps)}%`, transform: i === labels.length - 1 ? 'translateX(-100%)' : i === 0 ? 'none' : 'translateX(-50%)' }}>
            {i === 0 ? 'START' : i === labels.length - 1 ? `FIN · ${label}` : label}
          </span>
        ))}
      </div>

      {/* ── Legend ── */}
      <div className={`${a.row} ${a.wrap}`} style={{ gap: 14 }}>
        {[
          { color: SEGMENT_COLORS.racing, label: 'Racing', w: 12, h: 6 },
          { color: SEGMENT_COLORS.sc,     label: 'SC',     w: 12, h: 6 },
          { color: SEGMENT_COLORS.vsc,    label: 'VSC',    w: 12, h: 6 },
          { color: PIT_INK,               label: 'Pit stop', w: 2, h: 12 },
        ].map(({ color, label, w, h }) => (
          <span key={label} className={a.row} style={{ gap: 6 }}>
            <span style={{ width: w, height: h, background: color, flex: 'none' }} aria-hidden="true" />
            <span className={ui.label}>{label}</span>
          </span>
        ))}
        {peakPct != null && (
          <span className={a.row} style={{ gap: 6 }}>
            <span style={{ width: 2, height: 12, background: PEAK_INK, flex: 'none' }} aria-hidden="true" />
            <span className={ui.label}>Peak chaos L{chaosIndex.peak_chaos_lap}</span>
          </span>
        )}
      </div>
    </Panel>
  )
}
