import { ConfidenceChip } from '@/components/ui/ConfidenceChip'
import type { LiveNote } from '@/types/live'

type Props = { notes: LiveNote[] }

const TYPE_LABEL: Record<LiveNote['type'], string> = {
  TRACK_STATUS: 'Track',
  PIT_CYCLE: 'Pit cycle',
  CHAOS: 'Chaos',
  BATTLE: 'Battle',
  FEED: 'Feed',
}

const TYPE_STYLE: Record<LiveNote['type'], string> = {
  TRACK_STATUS: 'text-signal-amber border-signal-amber/40 bg-signal-amber/10',
  PIT_CYCLE: 'text-signal-blue border-signal-blue/40 bg-signal-blue/10',
  CHAOS: 'text-signal-red border-signal-red/40 bg-signal-red/10',
  BATTLE: 'text-signal-green border-signal-green/40 bg-signal-green/10',
  FEED: 'text-text-secondary border-border-default bg-bg-elevated',
}

const SEVERITY_BORDER: Record<LiveNote['severity'], string> = {
  High: 'border-l-signal-red',
  Medium: 'border-l-signal-amber',
  Low: 'border-l-border-default',
}

/** Deterministic: thresholds over measured values, template text, no model. */
export function LiveEngineerNotes({ notes }: Props) {
  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Engineer notes
        </span>
        <span className="font-mono text-[10px] text-text-muted">
          {notes.length} · deterministic
        </span>
      </div>

      {notes.length === 0 ? (
        <p className="px-3 py-6 text-center font-mono text-[11px] text-text-muted">
          Nothing has crossed a threshold yet.
        </p>
      ) : (
        <div className="divide-y divide-border-subtle">
          {notes.map((note) => (
            <div
              key={note.id}
              className={`px-3 py-2.5 border-l-2 flex gap-3 ${SEVERITY_BORDER[note.severity]}`}
            >
              <div className="w-8 shrink-0 pt-0.5">
                <span className="font-mono text-[9px] text-text-muted tabular-nums">
                  {note.lap_number != null ? `L${note.lap_number}` : '–'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span
                    className={`px-1.5 py-0.5 border rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[0.5px] shrink-0 ${TYPE_STYLE[note.type]}`}
                  >
                    {TYPE_LABEL[note.type]}
                  </span>
                  <span className="font-display font-bold text-[11px] text-text-primary tracking-[0.3px]">
                    {note.title}
                  </span>
                  <ConfidenceChip confidence={note.confidence} />
                </div>
                <p className="font-mono text-[10px] text-text-secondary leading-relaxed">
                  {note.message}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="px-3 py-1.5 border-t border-border-subtle">
        <p className="font-mono text-[9px] text-text-muted leading-relaxed">
          Generated from computed metrics by fixed thresholds. No AI generation — the same rule as
          the post-race notes.
        </p>
      </div>
    </div>
  )
}
