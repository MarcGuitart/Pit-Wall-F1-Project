export function TrafficAndPrepPanel() {
  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[length:var(--pw-text-xs)] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Traffic & Prep
        </span>
        <span className="px-1.5 py-0.5 bg-signal-blue/10 border border-signal-blue/20 rounded-[2px] font-display font-bold text-[length:var(--pw-text-xs)] uppercase tracking-[0.5px] text-signal-blue">
          Coming soon
        </span>
      </div>
      <div className="p-4 text-center">
        <p className="font-mono text-[length:var(--pw-text-xs)] text-text-secondary">
          Traffic and prep analysis · qualifying sessions
        </p>
        <p className="font-mono text-[length:var(--pw-text-xs)] text-text-muted mt-1">
          Detects compromised runs via is_pit_out_lap + interval data
        </p>
      </div>
    </div>
  )
}
