import { ConfidenceChip } from '@/components/ui/ConfidenceChip'
import type { PitWatchSignal } from '@/types/live'

type Props = {
  signals: PitWatchSignal[]
  focusedDriver: string | null
}

const KIND_LABEL: Record<PitWatchSignal['kind'], string> = {
  CHEAP_STOP_WINDOW: 'Cheap stop',
  STINT_LENGTH: 'Stint length',
  PACE_LOSS: 'Pace loss',
  UNDERCUT_EXPOSURE: 'Undercut exposure',
}

const KIND_STYLE: Record<PitWatchSignal['kind'], string> = {
  CHEAP_STOP_WINDOW: 'text-signal-amber border-signal-amber/40 bg-signal-amber/10',
  STINT_LENGTH: 'text-signal-blue border-signal-blue/40 bg-signal-blue/10',
  PACE_LOSS: 'text-signal-purple border-signal-purple/40 bg-signal-purple/10',
  UNDERCUT_EXPOSURE: 'text-signal-green border-signal-green/40 bg-signal-green/10',
}

/**
 * Signals, not predictions — the same line the post-race analysis holds.
 *
 * Every row states something already measured (laps on this tyre, seconds lost
 * against the driver's own stint best, a rival's interval and stop count) and
 * the sample it rests on. None of them says a driver will stop, or on which
 * lap: a stop is decided on a pit wall with fuel, damage and a weather read
 * this project does not have. The header says so once, so no row has to.
 */
export function PitWindowWatch({ signals, focusedDriver }: Props) {
  const shown = focusedDriver ? signals.filter((s) => s.driver_code === focusedDriver) : signals

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between gap-2">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Pit window watch
        </span>
        <span className="font-mono text-[10px] text-text-muted">
          {shown.length} signal{shown.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="px-3 py-2 border-b border-border-subtle bg-bg-elevated/40">
        <p className="font-mono text-[9px] text-text-muted leading-relaxed">
          Measurements of the present, with the sample behind each one. Not a forecast: nothing in
          the feed says when a team will call a car in.
        </p>
      </div>

      {shown.length === 0 ? (
        <p className="px-3 py-6 text-center font-mono text-[11px] text-text-muted">
          {focusedDriver
            ? `Nothing measurable for ${focusedDriver} right now.`
            : 'No thresholds crossed yet.'}
        </p>
      ) : (
        <div className="divide-y divide-border-subtle">
          {shown.map((signal, i) => (
            <div key={`${signal.driver_number}-${signal.kind}-${i}`} className="px-3 py-2.5">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-display font-bold text-[12px] tracking-[0.5px] text-text-primary">
                  {signal.driver_code}
                </span>
                <span
                  className={`px-1.5 py-0.5 border rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[0.5px] ${KIND_STYLE[signal.kind]}`}
                >
                  {KIND_LABEL[signal.kind]}
                </span>
                <ConfidenceChip confidence={signal.confidence} />
              </div>

              <p className="font-mono text-[11px] text-text-primary leading-snug mb-1">
                {signal.headline}
              </p>
              <p className="font-mono text-[10px] text-text-secondary leading-relaxed">
                {signal.measurement}
              </p>
              <p className="font-mono text-[9px] text-text-muted mt-1">
                Basis: {signal.basis}.
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
