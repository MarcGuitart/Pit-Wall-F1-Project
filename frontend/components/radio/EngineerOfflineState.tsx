'use client'

import { buttonClass, ui } from '@/components/ui'
import r from './radio.module.css'
import { OFFLINE_COPY } from '@/lib/chat/engineerStatus'

type EngineerOfflineStateProps = {
  /** Which side is down: the API itself, or the language model behind it. */
  reason: 'server' | 'model'
  onCheckConnection: () => void
  onContinueAnyway: () => void
}

export function EngineerOfflineState({
  reason,
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
          {OFFLINE_COPY[reason]}
        </p>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={onCheckConnection} className={buttonClass('ink')}>Check connection</button>
        <button type="button" onClick={onContinueAnyway} className={buttonClass()}>Continue anyway</button>
      </div>
    </div>
  )
}
