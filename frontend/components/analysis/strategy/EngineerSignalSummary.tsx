'use client'

import { useState } from 'react'
import type { EngineerNote } from '@/types'
import { NOTE_TYPE_LABELS } from '@/lib/constants'
import { MethodologyBadge } from '@/components/ui/MethodologyBadge'

type Props = { notes: EngineerNote[]; onViewAll: () => void }

type FilterKey = 'all' | 'tyre' | 'undercut' | 'chaos' | 'pit' | 'weather'

const FILTER_TYPES: { key: FilterKey; label: string; noteTypes?: EngineerNote['type'][] }[] = [
  { key: 'all',      label: 'All' },
  { key: 'tyre',     label: 'Tyre',     noteTypes: ['TYRE_DEGRADATION'] },
  { key: 'undercut', label: 'Undercut', noteTypes: ['UNDERCUT'] },
  { key: 'chaos',    label: 'SC/VSC',   noteTypes: ['CHAOS'] },
  { key: 'pit',      label: 'Pit',      noteTypes: ['PIT_IMPACT'] },
  { key: 'weather',  label: 'Weather',  noteTypes: ['WEATHER'] },
]

const CHIP_ACTIVE: Record<FilterKey, string> = {
  all:      'bg-bg-elevated border-border-default text-text-primary',
  tyre:     'bg-signal-amber/15 border-signal-amber/40 text-signal-amber',
  undercut: 'bg-signal-purple/15 border-signal-purple/40 text-signal-purple',
  chaos:    'bg-signal-red/15 border-signal-red/40 text-signal-red',
  pit:      'bg-signal-blue/15 border-signal-blue/40 text-signal-blue',
  weather:  'bg-signal-blue/10 border-signal-blue/30 text-signal-blue',
}

const TYPE_BADGE: Record<EngineerNote['type'], string> = {
  TYRE_DEGRADATION: 'text-signal-amber border-signal-amber/40 bg-signal-amber/10',
  UNDERCUT:         'text-signal-purple border-signal-purple/40 bg-signal-purple/10',
  PIT_IMPACT:       'text-signal-blue border-signal-blue/40 bg-signal-blue/10',
  CHAOS:            'text-signal-red border-signal-red/40 bg-signal-red/10',
  TRAFFIC:          'text-text-secondary border-border-default bg-bg-elevated',
  TRUE_PACE:        'text-signal-green border-signal-green/40 bg-signal-green/10',
  WEATHER:          'text-signal-blue border-signal-blue/40 bg-signal-blue/10',
  ANOMALY:          'text-signal-purple border-signal-purple/40 bg-signal-purple/10',
}

export function EngineerSignalSummary({ notes, onViewAll }: Props) {
  const [active, setActive] = useState<FilterKey>('all')

  const countOf = (key: FilterKey) => {
    const f = FILTER_TYPES.find((t) => t.key === key)
    return f?.noteTypes ? notes.filter((n) => f.noteTypes!.includes(n.type)).length : notes.length
  }

  const filtered = (() => {
    const f = FILTER_TYPES.find((t) => t.key === active)
    const base = f?.noteTypes ? notes.filter((n) => f.noteTypes!.includes(n.type)) : notes
    return base.sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.severity] - { High: 0, Medium: 1, Low: 2 }[b.severity])).slice(0, 5)
  })()

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">Engineer Signals</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-text-muted">{notes.length} total</span>
          <MethodologyBadge module="notes" />
        </div>
      </div>

      {/* Filter chips */}
      <div className="px-3 py-2 border-b border-border-subtle flex items-center gap-1 flex-wrap">
        {FILTER_TYPES.map((f) => (
          <button key={f.key}
            onClick={() => setActive(f.key)}
            className={[
              'px-1.5 py-0.5 border rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[0.5px] transition-colors',
              active === f.key ? CHIP_ACTIVE[f.key] : 'border-border-subtle text-text-muted hover:border-border-default hover:text-text-secondary',
            ].join(' ')}>
            {f.label} ({countOf(f.key)})
          </button>
        ))}
      </div>

      {/* Note list */}
      {filtered.length === 0 ? (
        <div className="px-3 py-4 text-center">
          <p className="font-mono text-[10px] text-text-muted">No signals generated for this session.</p>
        </div>
      ) : (
        <div className="divide-y divide-border-subtle">
          {filtered.map((note, i) => (
            <div key={i} className="px-3 py-2 flex gap-2">
              <span className="font-mono text-[9px] text-text-muted tabular-nums w-6 shrink-0 pt-0.5">
                {note.lap_number != null ? `L${note.lap_number}` : '–'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`px-1.5 py-[1px] border rounded-[2px] font-display font-bold text-[7px] uppercase tracking-[0.5px] shrink-0 ${TYPE_BADGE[note.type]}`}>
                    {NOTE_TYPE_LABELS[note.type] ?? note.type}
                  </span>
                  <span className="font-display font-bold text-[11px] text-text-primary truncate">{note.title}</span>
                </div>
                <p className="font-mono text-[10px] text-text-secondary leading-relaxed"
                  style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {note.message}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="px-3 py-2 border-t border-border-subtle">
        <button onClick={onViewAll}
          className="w-full text-center font-mono text-[10px] text-text-muted hover:text-signal-blue transition-colors">
          View all {notes.length} signals →
        </button>
      </div>
    </div>
  )
}
