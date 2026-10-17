'use client'

import { useState } from 'react'
import type { EngineerNote } from '@/types'
import { NOTE_TYPE_LABELS } from '@/lib/constants'
import { MethodologyBadge } from '@/components/ui/MethodologyBadge'
import { Badge, Panel, buttonClass } from '@/components/ui'
import { NOTE_TYPE_TONE } from '../noteTone'
import a from '../analysis.module.css'

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

export function EngineerSignalSummary({ notes, onViewAll }: Props) {
  const [active, setActive] = useState<FilterKey>('all')

  const countOf = (key: FilterKey) => {
    const f = FILTER_TYPES.find((t) => t.key === key)
    return f?.noteTypes ? notes.filter((n) => f.noteTypes!.includes(n.type)).length : notes.length
  }

  const filtered = (() => {
    const f = FILTER_TYPES.find((t) => t.key === active)
    const base = f?.noteTypes ? notes.filter((n) => f.noteTypes!.includes(n.type)) : notes
    // Sort a copy: `notes` is the page's own array (analysis.engineer_notes), shared with
    // every other panel. Sorting it in place reordered the notes everywhere.
    return [...base].sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.severity] - { High: 0, Medium: 1, Low: 2 }[b.severity])).slice(0, 5)
  })()

  return (
    <Panel
      title="Engineer Signals"
      aside={<>{notes.length} total<MethodologyBadge module="notes" /></>}
      padded={false}
      foot={
        <button type="button" onClick={onViewAll} className={a.linkBtn}>
          View all {notes.length} signals →
        </button>
      }
    >
      {/* Filter chips */}
      <div className={`${a.row} ${a.wrap}`} style={{ padding: '10px 20px', borderBottom: '1px solid var(--pw-divider)', gap: 6 }} role="group" aria-label="Filter signals">
        {FILTER_TYPES.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={active === f.key}
            onClick={() => setActive(f.key)}
            className={`${buttonClass()} ${active === f.key ? a.chipOn : ''}`}
            style={{ fontSize: 11, minHeight: 28, padding: '2px 8px' }}
          >
            {f.label} ({countOf(f.key)})
          </button>
        ))}
      </div>

      {/* Note list */}
      {filtered.length === 0 ? (
        <p className={a.para} style={{ padding: '16px 20px', textAlign: 'center' }}>No signals generated for this session.</p>
      ) : (
        <div className={a.list}>
          {filtered.map((note, i) => (
            <div key={i} className={a.item} style={{ display: 'flex', gap: 12 }}>
              <span className={`${a.num} ${a.muted}`} style={{ width: 30, flex: 'none', fontSize: 12 }}>
                {note.lap_number != null ? `L${note.lap_number}` : '–'}
              </span>
              <div className={a.grow}>
                <div className={a.row} style={{ marginBottom: 4 }}>
                  <Badge tone={NOTE_TYPE_TONE[note.type] ?? 'muted'}>{NOTE_TYPE_LABELS[note.type] ?? note.type}</Badge>
                  <span className={`${a.itemTitle} ${a.ellipsis}`}>{note.title}</span>
                </div>
                <p className={`${a.para} ${a.clamp2}`}>{note.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
