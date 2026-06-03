type AnalysisModeToggleProps = {
  mode: 'strategy' | 'data'
  sessionType: string
  lapCount: number
  onChange: (mode: 'strategy' | 'data') => void
}

export function AnalysisModeToggle({
  mode,
  sessionType,
  lapCount,
  onChange,
}: AnalysisModeToggleProps) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3 py-2">
      {/* Toggle */}
      <div className="flex items-center bg-bg-elevated border border-border-subtle rounded-[3px] p-0.5 gap-0.5">
        <button
          onClick={() => onChange('strategy')}
          className={[
            'px-3 py-1.5 rounded-[2px] font-display font-bold text-[10px] uppercase tracking-[1px] transition-all',
            mode === 'strategy'
              ? 'bg-bg-primary border border-border-default text-text-primary shadow-inner'
              : 'text-text-muted hover:text-text-secondary',
          ].join(' ')}
        >
          Strategy View
        </button>
        <button
          onClick={() => onChange('data')}
          className={[
            'px-3 py-1.5 rounded-[2px] font-display font-bold text-[10px] uppercase tracking-[1px] transition-all',
            mode === 'data'
              ? 'bg-bg-primary border border-border-default text-text-primary shadow-inner'
              : 'text-text-muted hover:text-text-secondary',
          ].join(' ')}
        >
          Data View
        </button>
      </div>

      {/* Context hint */}
      <span className="font-mono text-[10px] text-text-muted">
        {mode === 'strategy' ? 'Strategy View' : 'Data View'}
        {' · '}
        <span className="text-text-secondary">{sessionType} session</span>
        {' · '}
        {lapCount} laps indexed
      </span>
    </div>
  )
}
