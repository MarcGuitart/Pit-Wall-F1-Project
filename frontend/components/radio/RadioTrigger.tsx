'use client'

import { useEffect, useState } from 'react'
import { useRaceStore } from '@/stores/raceStore'
import sh from '@/components/layout/shell.module.css'

const NUM_BARS = 9

export function RadioTrigger() {
  const { setRadioOpen, analysis, focusedDriver } = useRaceStore()
  const [heights, setHeights] = useState<number[]>(() =>
    Array.from({ length: NUM_BARS }, () => 4)
  )

  useEffect(() => {
    const id = setInterval(() => {
      setHeights(Array.from({ length: NUM_BARS }, () => Math.random() * 8 + 3))
    }, 300)
    return () => clearInterval(id)
  }, [])

  const label = focusedDriver ? `Ask about ${focusedDriver.code} →` : 'Engineer'

  return (
    <button
      type="button"
      onClick={() => setRadioOpen(true)}
      disabled={!analysis}
      className={sh.engineer}
      title={analysis ? 'Talk to Race Engineer' : 'Load a race first'}
    >
      {/* Animated waveform bars */}
      <span className={sh.wave} aria-hidden="true">
        {heights.map((h, i) => <span key={i} style={{ height: `${h}px` }} />)}
      </span>
      <span>{label}</span>
    </button>
  )
}
