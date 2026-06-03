export function SectorStrengthMap() {
  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Sector Strength Map
        </span>
        <span className="px-1.5 py-0.5 bg-signal-blue/10 border border-signal-blue/20 rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[0.5px] text-signal-blue">
          Coming soon
        </span>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-3 gap-2 mb-3">
          {['S1', 'S2', 'S3'].map((s) => (
            <div key={s} className="bg-bg-elevated border border-border-default rounded-[3px] px-2 py-3 text-center">
              <div className="font-display font-black text-[16px] text-text-muted">{s}</div>
              <div className="font-mono text-[8px] text-text-muted mt-1">awaiting data</div>
            </div>
          ))}
        </div>
        <p className="font-mono text-[9px] text-text-muted text-center">
          Sector strength analysis — top driver per sector with delta to best
        </p>
      </div>
    </div>
  )
}
