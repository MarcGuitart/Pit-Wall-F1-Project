type AnalysisModeToggleProps = {
  mode: 'strategy' | 'data'
  sessionType: string
  lapCount: number
  onChange: (mode: 'strategy' | 'data') => void
}

export function AnalysisModeToggle({
  mode, sessionType, lapCount, onChange,
}: AnalysisModeToggleProps) {
  const handleKey = (target: 'strategy' | 'data') => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(target) }
  }

  return (
    <div className="flex items-center justify-between flex-wrap gap-3 py-1.5">
      <div
        role="tablist"
        className="flex items-center bg-bg-elevated border border-border-subtle rounded-[3px] p-0.5 gap-0.5"
      >
        {(['strategy', 'data'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            tabIndex={0}
            onClick={() => onChange(m)}
            onKeyDown={handleKey(m)}
            className={[
              'px-3 py-1.5 rounded-[2px] font-display font-bold text-[10px] uppercase tracking-[1px] transition-all',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal-blue',
              mode === m
                ? 'bg-bg-primary border border-border-default text-text-primary shadow-inner'
                : 'text-text-muted hover:text-text-secondary',
            ].join(' ')}
          >
            {m === 'strategy' ? 'Strategy View' : 'Data View'}
          </button>
        ))}
      </div>
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
