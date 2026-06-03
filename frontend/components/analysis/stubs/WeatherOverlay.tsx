export function WeatherOverlay() {
  return (
    <div
      className="bg-bg-elevated rounded-[4px] px-4 py-3"
      style={{ border: '1px dashed #252D3A' }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-display font-bold text-[10px] uppercase tracking-[1.5px] text-text-muted">
          Weather Strategy Impact
        </span>
        <span className="px-1.5 py-0.5 border border-dashed border-border-default rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[0.5px] text-text-muted">
          Coming soon
        </span>
      </div>
      <p className="font-mono text-[10px] text-text-muted">
        Correlating temperature changes and rainfall with lap time evolution
      </p>
    </div>
  )
}
