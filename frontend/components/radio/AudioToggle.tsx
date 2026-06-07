'use client'

import { useState } from 'react'
import { isAudioEnabled, setAudioEnabled } from '@/lib/audio/radioFx'

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
      onClick={toggle}
      className="font-display font-bold text-[9px] uppercase tracking-[1px] transition-colors"
      style={{ color: enabled ? '#23D18B' : '#4A5568' }}
      title={enabled ? 'Mute radio sounds' : 'Enable radio sounds'}
    >
      {enabled ? 'AUDIO ON' : 'AUDIO OFF'}
    </button>
  )
}
