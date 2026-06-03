export function RunTimingPanel() {
  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Run Timing
        </span>
        <span className="px-1.5 py-0.5 bg-signal-blue/10 border border-signal-blue/20 rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[0.5px] text-signal-blue">
          Coming soon
        </span>
      </div>
      <div className="p-4 text-center">
        <p className="font-mono text-[10px] text-text-secondary">
          Run timing detail — qualifying run sequences
        </p>
        <p className="font-mono text-[9px] text-text-muted mt-1">
          Best lap per run, delta to session best, traffic flags
        </p>
      </div>
    </div>
  )
}
