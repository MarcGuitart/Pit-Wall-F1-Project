'use client'

import { useState } from 'react'
import { isAudioEnabled, setAudioEnabled } from '@/lib/audio/radioFx'
import { buttonClass } from '@/components/ui'

export function AudioToggle() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === 'undefined') return true
    return isAudioEnabled()
  })

  const toggle = () => {
    const next = !enabled
    setEnabled(next)
    setAudioEnabled(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      className={buttonClass('ghost')}
      style={{ color: enabled ? 'var(--pw-green)' : 'var(--pw-muted)', fontSize: 11, letterSpacing: '0.08em' }}
      title={enabled ? 'Mute radio sounds' : 'Enable radio sounds'}
    >
      {enabled ? 'AUDIO ON' : 'AUDIO OFF'}
    </button>
  )
}
