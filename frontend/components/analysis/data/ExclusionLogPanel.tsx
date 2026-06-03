import type { TruePaceRow } from '@/types'

type Props = { rows: TruePaceRow[] }

export function ExclusionLogPanel({ rows }: Props) {
  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle">
        <div className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Exclusion Log
        </div>
        <div className="font-mono text-[9px] text-text-muted mt-0.5">
          Why clean pace differs from broadcast timing
        </div>
      </div>
      <div className="divide-y divide-border-subtle">
        {rows.map((row) => (
          <div
            key={row.driver_number}
            className="px-3 py-2 border-l-2 border-l-border-default"
          >
            <div className="flex items-center gap-3 mb-1">
              <span className="font-display font-bold text-[10px] uppercase tracking-[0.5px] text-text-primary">
                {row.driver_code}
              </span>
              <span className="font-mono text-[9px] text-text-secondary">
                {row.sample_size} clean laps
              </span>
              <span className="font-mono text-[9px] text-text-muted">{row.team_name ?? ''}</span>
            </div>
            <div className="space-y-0.5 pl-0">
              {row.exclusion_log.length === 0 ? (
                <span className="font-mono text-[9px] text-signal-green">No exclusions — all laps valid</span>
              ) : (
                row.exclusion_log.map((log, i) => (
                  <div key={i} className="font-mono text-[9px] text-text-muted">· {log}</div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
