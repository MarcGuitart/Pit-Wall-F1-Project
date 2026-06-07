'use client'

type EngineerOfflineStateProps = {
  onCheckConnection: () => void
  onContinueAnyway: () => void
}

export function EngineerOfflineState({
  onCheckConnection,
  onContinueAnyway,
}: EngineerOfflineStateProps) {
  return (
    <div className="flex flex-col px-6 py-8 gap-5">
      {/* Amber accent bar at top of panel */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-signal-amber" />

      {/* Title */}
      <div>
        <div className="font-display font-black text-[14px] uppercase tracking-[1.5px] text-signal-amber mb-2">
          Engineer Radio Offline
        </div>
        <p className="font-mono text-[11px] text-text-secondary leading-relaxed">
          The local race engineer model is not running.
          Start Ollama to enable race engineer answers.
        </p>
      </div>

      {/* Commands */}
      <div className="flex flex-col gap-2">
        <p className="font-mono text-[10px] text-text-muted uppercase tracking-[1px] mb-1">
          Run in terminal:
        </p>
        <code
          className="block font-mono text-[11px] text-signal-green bg-bg-primary border border-border-default rounded-[3px] px-3 py-2"
        >
          ollama serve
        </code>
        <code
          className="block font-mono text-[11px] text-signal-green bg-bg-primary border border-border-default rounded-[3px] px-3 py-2"
        >
          ollama pull llama3.1:8b
        </code>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={onCheckConnection}
          className="px-4 py-2 bg-bg-elevated border border-border-default text-text-secondary font-display font-bold text-[10px] uppercase tracking-[1px] rounded-[3px] hover:text-text-primary hover:border-text-muted transition-colors"
        >
          Check connection
        </button>
        <button
          onClick={onContinueAnyway}
          className="px-4 py-2 border border-border-subtle text-text-muted font-display font-bold text-[10px] uppercase tracking-[1px] rounded-[3px] hover:text-text-secondary transition-colors"
        >
          Continue anyway
        </button>
      </div>
    </div>
  )
}
