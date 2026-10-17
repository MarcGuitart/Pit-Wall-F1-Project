'use client'

import { buttonClass, ui } from '@/components/ui'
import r from './radio.module.css'

type EngineerOfflineStateProps = {
  onCheckConnection: () => void
  onContinueAnyway: () => void
}

export function EngineerOfflineState({
  onCheckConnection,
  onContinueAnyway,
}: EngineerOfflineStateProps) {
  return (
    <div className={r.offline} role="alert">
      {/* Title */}
      <div>
        <h2 className={ui.h6} style={{ color: 'var(--pw-amber)', fontSize: 16, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          Engineer Radio Offline
        </h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--pw-muted)' }}>
          The local race engineer model is not running.
          Start Ollama to enable race engineer answers.
        </p>
      </div>

      {/* Commands */}
      <div style={{ display: 'grid', gap: 8 }}>
        <p className={ui.label} style={{ margin: 0 }}>Run in terminal:</p>
        <code className={r.code}>ollama serve</code>
        <code className={r.code}>ollama pull llama3.1:8b</code>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={onCheckConnection} className={buttonClass('ink')}>Check connection</button>
        <button type="button" onClick={onContinueAnyway} className={buttonClass()}>Continue anyway</button>
      </div>
    </div>
  )
}
