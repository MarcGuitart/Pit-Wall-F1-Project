import type { EngineerNote, PitImpactRow, ChaosIndex } from '@/types'
import { EstimatedLabel } from '@/components/ui/EstimatedLabel'

type SessionTimelineBarProps = {
  totalLaps: number
  sessionType: string
  engineerNotes: EngineerNote[]
  pitEvents: PitImpactRow[]
  chaosIndex: ChaosIndex
}

type Segment = {
  startPct: number
  endPct: number
  type: 'racing' | 'sc' | 'vsc'
}

function lapPct(lap: number, total: number) {
  return Math.min((lap / total) * 100, 100)
}

function parseSCSegments(
  notes: EngineerNote[],
  total: number
): Segment[] {
  const deployments = notes
    .filter((n) => n.type === 'CHAOS' && n.lap_number != null)
    .map((n) => ({
      lap: n.lap_number!,
      isVSC: n.title.toLowerCase().includes('vsc'),
    }))
    .sort((a, b) => a.lap - b.lap)

  const segments: Segment[] = []
  let lastEnd = 0

  for (const d of deployments) {
    const start = d.lap
    const end = Math.min(d.lap + 6, total) // approximate 6-lap SC window

    // Green segment before this SC
    if (start > lastEnd) {
      segments.push({
        startPct: lapPct(lastEnd, total),
        endPct: lapPct(start, total),
        type: 'racing',
      })
    }
    segments.push({
      startPct: lapPct(start, total),
      endPct: lapPct(end, total),
      type: d.isVSC ? 'vsc' : 'sc',
    })
    lastEnd = end
  }

  // Final green segment
  if (lastEnd < total) {
    segments.push({
      startPct: lapPct(lastEnd, total),
      endPct: 100,
      type: 'racing',
    })
  }

  if (segments.length === 0) {
    segments.push({ startPct: 0, endPct: 100, type: 'racing' })
  }

  return segments
}

const SEGMENT_COLORS = {
  racing: 'rgba(35,209,139,.18)',
  sc:     'rgba(255,176,32,.22)',
  vsc:    'rgba(232,0,29,.25)',
}

const LAP_LABEL_POSITIONS = (total: number) => [
  { lap: 1, label: 'L1' },
  { lap: Math.floor(total * 0.25), label: `L${Math.floor(total * 0.25)}` },
  { lap: Math.floor(total * 0.5),  label: `L${Math.floor(total * 0.5)}` },
  { lap: Math.floor(total * 0.75), label: `L${Math.floor(total * 0.75)}` },
  { lap: total, label: `L${total}` },
]

export function SessionTimelineBar({
  totalLaps,
  sessionType,
  engineerNotes,
  pitEvents,
  chaosIndex,
}: SessionTimelineBarProps) {
  if (totalLaps < 2) return null

  // ── Qualifying / Practice stubs ────────────────────────────────────────────
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

  // ── Race mode ──────────────────────────────────────────────────────────────
  const segments = parseSCSegments(engineerNotes, totalLaps)
  const labels = LAP_LABEL_POSITIONS(totalLaps)

  // Pit markers: deduplicate by lap
  const pitMarkers = pitEvents
    .filter((p) => p.lap_number != null)
    .map((p) => ({
      pct: lapPct(p.lap_number, totalLaps),
      driverCode: p.driver_code,
    }))

  // SC/VSC event markers
  const scMarkers = engineerNotes
    .filter((n) => n.type === 'CHAOS' && n.lap_number != null)
    .map((n) => ({
      pct: lapPct(n.lap_number!, totalLaps),
      isVSC: n.title.toLowerCase().includes('vsc'),
    }))

  // Peak chaos marker
  const peakPct =
    chaosIndex.peak_chaos_lap != null
      ? lapPct(chaosIndex.peak_chaos_lap, totalLaps)
      : null

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Race Timeline
        </span>
        <EstimatedLabel />
      </div>

      <div className="px-3 py-3">
        {/* Timeline track container */}
        <div className="relative mb-1" style={{ height: '22px' }}>
          {/* Segment fills */}
          <div className="absolute inset-0 flex rounded-[3px] overflow-hidden" style={{ top: '4px', height: '14px' }}>
            {segments.map((seg, i) => (
              <div
                key={i}
                style={{
                  left: `${seg.startPct}%`,
                  width: `${seg.endPct - seg.startPct}%`,
                  backgroundColor: SEGMENT_COLORS[seg.type],
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                }}
              />
            ))}
            {/* Base track (background) */}
            <div
              className="absolute inset-0 rounded-[3px]"
              style={{ background: '#181C23', zIndex: -1 }}
            />
          </div>

          {/* Pit stop markers */}
          {pitMarkers.map((m, i) => (
            <div
              key={`pit-${i}`}
              className="absolute"
              style={{
                left: `${m.pct}%`,
                top: 0,
                bottom: 0,
                width: '1px',
                backgroundColor: 'rgba(140,148,166,.5)',
                zIndex: 2,
              }}
              title={`${m.driverCode} pit`}
            />
          ))}

          {/* SC/VSC markers */}
          {scMarkers.map((m, i) => (
            <div
              key={`sc-${i}`}
              className="absolute"
              style={{
                left: `${m.pct}%`,
                top: 0,
                bottom: 0,
                width: '2px',
                backgroundColor: m.isVSC ? '#E8001D' : '#FFB020',
                zIndex: 3,
              }}
              title={m.isVSC ? 'VSC deployed' : 'SC deployed'}
            />
          ))}

          {/* Peak chaos marker */}
          {peakPct != null && (
            <div
              className="absolute"
              style={{
                left: `${peakPct}%`,
                top: 0,
                bottom: 0,
                width: '2px',
                backgroundColor: 'rgba(166,108,255,.7)',
                zIndex: 4,
              }}
              title={`Peak chaos L${chaosIndex.peak_chaos_lap}`}
            />
          )}
        </div>

        {/* Lap labels */}
        <div className="relative h-4 mb-2">
          {labels.map(({ lap, label }) => {
            const pct = lapPct(lap, totalLaps)
            return (
              <span
                key={lap}
                className="absolute font-mono text-[8px] text-text-muted -translate-x-1/2"
                style={{ left: `${pct}%` }}
              >
                {label}
              </span>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 flex-wrap">
          {[
            { color: SEGMENT_COLORS.racing, label: 'Racing' },
            { color: SEGMENT_COLORS.sc,     label: 'SC' },
            { color: SEGMENT_COLORS.vsc,    label: 'VSC' },
            { color: 'rgba(140,148,166,.5)', label: 'Pit stop' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1">
              <div
                className="rounded-sm"
                style={{ width: label === 'Pit stop' ? '2px' : '10px', height: label === 'Pit stop' ? '10px' : '4px', backgroundColor: color }}
              />
              <span className="font-display font-bold text-[8px] uppercase tracking-[0.5px] text-text-muted">
                {label}
              </span>
            </div>
          ))}
          {peakPct != null && (
            <div className="flex items-center gap-1">
              <div className="rounded-sm" style={{ width: '2px', height: '10px', backgroundColor: 'rgba(166,108,255,.7)' }} />
              <span className="font-display font-bold text-[8px] uppercase tracking-[0.5px] text-text-muted">
                Peak chaos L{chaosIndex.peak_chaos_lap}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
