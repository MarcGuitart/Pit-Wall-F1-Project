import type { EngineerNote } from '@/types'
import { NOTE_TYPE_LABELS } from '@/lib/constants'
import { Badge, Panel } from '@/components/ui'
import { NOTE_TYPE_TONE } from './noteTone'
import a from './analysis.module.css'

type Props = {
  notes: EngineerNote[]
  focusedDriver?: string | null
}

const SEVERITY_RULE: Record<EngineerNote['severity'], string> = {
  High:   'var(--pw-accent)',
  Medium: 'var(--pw-amber)',
  Low:    'var(--pw-divider)',
}

export function EngineerNotes({ notes, focusedDriver }: Props) {
  const subtitle = focusedDriver
    ? `Filtered for ${focusedDriver} · ${notes.length} signal${notes.length !== 1 ? 's' : ''}`
    : `${notes.length} signals · deterministic`

  return (
    <Panel title="Engineer Notes" aside={subtitle} padded={false}>
      {notes.length === 0 ? (
        <p className={a.para} style={{ padding: '24px 20px', textAlign: 'center' }}>
          No specific signals for <b style={{ color: 'var(--pw-text)' }}>{focusedDriver}</b> in this session.
        </p>
      ) : (
        <div className={a.list}>
          {notes.map((note, i) => (
            <div key={i} className={a.item} style={{ display: 'flex', gap: 12, boxShadow: `inset 4px 0 0 ${SEVERITY_RULE[note.severity]}` }}>
              <span className={`${a.num} ${a.muted}`} style={{ width: 32, flex: 'none', fontSize: 12 }}>
                {note.lap_number != null ? `L${note.lap_number}` : '–'}
              </span>
              <div className={a.grow}>
                <div className={`${a.row} ${a.wrap}`} style={{ marginBottom: 4 }}>
                  <Badge tone={NOTE_TYPE_TONE[note.type] ?? 'muted'}>{NOTE_TYPE_LABELS[note.type] ?? note.type}</Badge>
                  <span className={a.itemTitle}>{note.title}</span>
                </div>
                <p className={a.para}>{note.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
