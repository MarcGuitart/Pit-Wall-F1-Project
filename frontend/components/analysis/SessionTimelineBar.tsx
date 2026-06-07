'use client'

import { useState } from 'react'
import type { EngineerNote, PitImpactRow, ChaosIndex } from '@/types'
import { EstimatedLabel } from '@/components/ui/EstimatedLabel'

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

const SEGMENT_COLORS = {
  racing: 'rgba(35,209,139,.15)',
  sc:     'rgba(255,176,32,.28)',
  vsc:    'rgba(232,0,29,.22)',
}

// Checkered flag pattern for finish line
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

// ── Rich tooltip card ────────────────────────────────────────────────────────

type TooltipCardProps = {
  type: 'sc' | 'vsc' | 'pit' | 'peak'
  lap: number
  color: string
  label: string
  detail?: string
  alignRight?: boolean
}

function TooltipCard({ type, lap, color, label, detail, alignRight }: TooltipCardProps) {
  const icon =
    type === 'sc'   ? '⚠' :
    type === 'vsc'  ? '⚠' :
    type === 'pit'  ? '■' :
                     '↑'

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 10px)',
        ...(alignRight ? { right: 0 } : { left: '50%', transform: 'translateX(-50%)' }),
        background: '#0B0D12',
        border: `1px solid ${color}55`,
        borderLeft: `3px solid ${color}`,
        borderRadius: '3px',
        minWidth: '130px',
        maxWidth: '220px',
        pointerEvents: 'none',
        zIndex: 30,
        boxShadow: `0 4px 16px rgba(0,0,0,0.6), 0 0 0 1px ${color}22`,
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '5px 8px 3px',
          borderBottom: `1px solid ${color}22`,
        }}
      >
        <span style={{ fontSize: '9px', color, lineHeight: 1 }}>{icon}</span>
        <span
          style={{
            fontFamily: 'Barlow Condensed, sans-serif',
            fontWeight: 700,
            fontSize: '9px',
            letterSpacing: '1.2px',
            textTransform: 'uppercase',
            color,
          }}
        >
          {label}
        </span>
      </div>

      {/* Lap number */}
      <div style={{ padding: '4px 8px 2px' }}>
        <span
          style={{
            fontFamily: 'Barlow Condensed, sans-serif',
            fontWeight: 900,
            fontSize: '22px',
            lineHeight: 1,
            color: '#F0F2F5',
            letterSpacing: '-0.5px',
          }}
        >
          LAP {lap}
        </span>
      </div>

      {/* Detail */}
      {detail && (
        <div style={{ padding: '0 8px 6px' }}>
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '9px',
              color: '#8A94A6',
              lineHeight: 1.5,
              display: 'block',
              wordBreak: 'break-word',
              whiteSpace: 'normal',
            }}
          >
            {detail}
          </span>
        </div>
      )}

      {/* Arrow pointing down */}
      <div
        style={{
          position: 'absolute',
          top: '100%',
          left: alignRight ? 'auto' : '50%',
          right: alignRight ? '12px' : 'auto',
          transform: alignRight ? 'none' : 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: `6px solid ${color}55`,
        }}
      />
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
  tooltip: React.ReactNode
}

function Marker({ pct, barColor, barWidth = 2, zIndex = 2, dimmed = false, tooltip }: MarkerProps) {
  const [hovered, setHovered] = useState(false)

  // Clamp tooltip alignment for markers near edges
  const alignRight = pct > 85

  return (
    <div
      style={{
        position: 'absolute',
        left: `${pct}%`,
        top: 0,
        bottom: 0,
        // Wide invisible hit area for easy hovering
        width: '14px',
        transform: 'translateX(-50%)',
        zIndex,
        cursor: 'default',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Actual visible bar — thin, centered within hit area */}
      <div
        style={{
          width: `${barWidth}px`,
          height: '100%',
          backgroundColor: barColor,
          opacity: hovered ? 1 : (dimmed ? 0.45 : 1),
          transition: 'opacity 0.12s',
          flexShrink: 0,
        }}
      />

      {/* Tooltip card */}
      {hovered && (
        <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0 }}>
          {/* Re-position relative to parent via alignRight */}
          <div style={{ position: 'relative', width: 0, height: 0 }}>
            <div style={{ position: 'absolute', bottom: '8px', ...(alignRight ? { right: 0 } : { left: '50%', transform: 'translateX(-50%)' }) }}>
              {tooltip}
            </div>
          </div>
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
      <div className="bg-bg-panel border border-border-subtle rounded-[4px] px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
            Session Timeline
          </span>
          <EstimatedLabel />
        </div>
        <div className="h-[14px] bg-bg-elevated rounded-[3px] flex items-center justify-center">
          <span className="font-mono text-[9px] text-text-muted">
            Timeline — {sessionType} session
          </span>
        </div>
      </div>
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

  const TRACK_H = 20  // px

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Race Timeline
        </span>
        <EstimatedLabel />
      </div>

      <div className="px-3 py-3">
        {/* Track + markers — overflow visible so tooltips escape the panel */}
        <div className="relative" style={{ paddingBottom: '4px' }}>

          {/* ── Track area ───────────────────────────────────────────────── */}
          <div
            className="relative"
            style={{ height: `${TRACK_H}px`, marginBottom: '6px' }}
          >
            {/* Background track */}
            <div
              className="absolute inset-0 rounded-[2px]"
              style={{ background: '#111419' }}
            />

            {/* Segment fills */}
            {segments.map((seg, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0"
                style={{
                  left: `${seg.startPct}%`,
                  width: `${seg.endPct - seg.startPct}%`,
                  backgroundColor: SEGMENT_COLORS[seg.type],
                }}
              />
            ))}

            {/* ── Start line (left edge) ──────────────────────────────── */}
            <div
              className="absolute top-0 bottom-0 left-0 rounded-l-[2px]"
              style={{ width: '5px', background: 'rgba(240,242,245,0.22)', zIndex: 5 }}
            />
            {/* Start line accent */}
            <div
              className="absolute top-0 bottom-0 left-0"
              style={{ width: '2px', background: 'rgba(240,242,245,0.55)', zIndex: 6 }}
            />

            {/* ── Finish line (right edge, checkered) ─────────────────── */}
            <div
              className="absolute top-0 bottom-0 right-0 rounded-r-[2px]"
              style={{ width: '10px', zIndex: 5, ...CHECKER_BG }}
            />

            {/* ── Pit stop markers ─────────────────────────────────────── */}
            {pitMarkers.map((m, i) => (
              <Marker
                key={`pit-${i}`}
                pct={m.pct}
                barColor="rgba(140,148,166,0.7)"
                barWidth={1}
                zIndex={7}
                dimmed
                tooltip={
                  <TooltipCard
                    type="pit"
                    lap={m.lap}
                    color="#8A94A6"
                    label={`${m.driverCode} pit stop`}
                    detail={m.laneDuration ? `Lane: ${m.laneDuration.toFixed(1)}s` : undefined}
                    alignRight={m.pct > 85}
                  />
                }
              />
            ))}

            {/* ── SC/VSC markers ──────────────────────────────────────── */}
            {scMarkers.map((m, i) => (
              <Marker
                key={`sc-${i}`}
                pct={m.pct}
                barColor={m.isVSC ? '#E8001D' : '#FFB020'}
                barWidth={2}
                zIndex={8}
                tooltip={
                  <TooltipCard
                    type={m.isVSC ? 'vsc' : 'sc'}
                    lap={m.lap}
                    color={m.isVSC ? '#E8001D' : '#FFB020'}
                    label={m.isVSC ? 'Virtual Safety Car' : 'Safety Car'}
                    detail={m.message || undefined}
                    alignRight={m.pct > 85}
                  />
                }
              />
            ))}

            {/* ── Peak chaos marker ────────────────────────────────────── */}
            {peakPct != null && (
              <Marker
                pct={peakPct}
                barColor="rgba(166,108,255,0.8)"
                barWidth={2}
                zIndex={9}
                tooltip={
                  <TooltipCard
                    type="peak"
                    lap={chaosIndex.peak_chaos_lap!}
                    color="#A66CFF"
                    label="Peak chaos lap"
                    detail={`Chaos score: ${chaosIndex.score} · ${chaosIndex.level}`}
                    alignRight={peakPct > 85}
                  />
                }
              />
            )}
          </div>

          {/* ── Lap labels row ───────────────────────────────────────────── */}
          <div className="relative h-4" style={{ marginBottom: '8px' }}>
            {labels.map(({ lap, label }, i) => (
              <span
                key={lap}
                className="absolute font-mono text-text-muted"
                style={{
                  left: `${lapPct(lap, totalLaps)}%`,
                  fontSize: '8px',
                  transform: i === labels.length - 1
                    ? 'translateX(-100%)'
                    : i === 0 ? 'none' : 'translateX(-50%)',
                }}
              >
                {i === 0 ? 'START' : i === labels.length - 1 ? `FIN · ${label}` : label}
              </span>
            ))}
          </div>

          {/* ── Legend ───────────────────────────────────────────────────── */}
          <div className="flex items-center gap-4 flex-wrap">
            {[
              { color: SEGMENT_COLORS.racing, label: 'Racing', w: 10, h: 4 },
              { color: SEGMENT_COLORS.sc,     label: 'SC',     w: 10, h: 4 },
              { color: SEGMENT_COLORS.vsc,    label: 'VSC',    w: 10, h: 4 },
              { color: 'rgba(140,148,166,.6)', label: 'Pit stop', w: 2, h: 10 },
            ].map(({ color, label, w, h }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="rounded-sm" style={{ width: w, height: h, backgroundColor: color, flexShrink: 0 }} />
                <span className="font-display font-bold text-[8px] uppercase tracking-[0.5px] text-text-muted">
                  {label}
                </span>
              </div>
            ))}
            {peakPct != null && (
              <div className="flex items-center gap-1.5">
                <div className="rounded-sm" style={{ width: 2, height: 10, backgroundColor: 'rgba(166,108,255,.8)', flexShrink: 0 }} />
                <span className="font-display font-bold text-[8px] uppercase tracking-[0.5px] text-text-muted">
                  Peak chaos L{chaosIndex.peak_chaos_lap}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
