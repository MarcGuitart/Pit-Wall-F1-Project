import type { EngineerNote } from '@/types'
import { NOTE_TYPE_LABELS } from '@/lib/constants'

type Props = {
  notes: EngineerNote[]
  focusedDriver?: string | null
}

const TYPE_STYLE: Record<EngineerNote['type'], string> = {
  TYRE_DEGRADATION: 'text-signal-amber border-signal-amber/40 bg-signal-amber/10',
  UNDERCUT:         'text-signal-purple border-signal-purple/40 bg-signal-purple/10',
  PIT_IMPACT:       'text-signal-blue border-signal-blue/40 bg-signal-blue/10',
  CHAOS:            'text-signal-red border-signal-red/40 bg-signal-red/10',
  TRAFFIC:          'text-text-secondary border-border-default bg-bg-elevated',
  TRUE_PACE:        'text-signal-green border-signal-green/40 bg-signal-green/10',
  WEATHER:          'text-signal-blue border-signal-blue/40 bg-signal-blue/10',
  ANOMALY:          'text-signal-purple border-signal-purple/40 bg-signal-purple/10',
}

const SEVERITY_BORDER: Record<EngineerNote['severity'], string> = {
  High:   'border-l-signal-red',
  Medium: 'border-l-signal-amber',
  Low:    'border-l-border-default',
}

export function EngineerNotes({ notes, focusedDriver }: Props) {
  const subtitle = focusedDriver
    ? `Filtered for ${focusedDriver} · ${notes.length} signal${notes.length !== 1 ? 's' : ''}`
    : `${notes.length} signals · deterministic`

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Engineer Notes
        </span>
        <span className="font-mono text-[10px] text-text-muted">{subtitle}</span>
      </div>

      {notes.length === 0 ? (
        <div className="px-3 py-6 text-center">
          <p className="font-mono text-[11px] text-text-muted">
            No specific signals for{' '}
            <span className="text-text-secondary font-bold">{focusedDriver}</span> in this session.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border-subtle">
          {notes.map((note, i) => (
            <div
              key={i}
              className={`px-3 py-2.5 border-l-2 flex gap-3 ${SEVERITY_BORDER[note.severity]}`}
            >
              <div className="w-8 shrink-0 pt-0.5">
                {note.lap_number != null ? (
                  <span className="font-mono text-[9px] text-text-muted tabular-nums">
                    L{note.lap_number}
                  </span>
                ) : (
                  <span className="font-mono text-[9px] text-text-muted">–</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span
                    className={`px-1.5 py-0.5 border rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[0.5px] shrink-0 ${TYPE_STYLE[note.type]}`}
                  >
                    {NOTE_TYPE_LABELS[note.type] ?? note.type}
                  </span>
                  <span className="font-display font-bold text-[11px] text-text-primary">
                    {note.title}
                  </span>
                </div>
                <p className="font-mono text-[10px] text-text-secondary leading-relaxed">
                  {note.message}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
