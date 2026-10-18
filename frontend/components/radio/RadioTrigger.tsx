'use client'

import { useEffect, useState } from 'react'
import { useRaceStore } from '@/stores/raceStore'
import sh from '@/components/layout/shell.module.css'

const NUM_BARS = 9
/** The bars' full height — .wave in shell.module.css. */
const WAVE_PX = 14

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
      {/* Animated waveform bars: full-height bars scaled from the bottom, so the
          movement is a transform (composited) rather than a height (layout). */}
      <span className={sh.wave} aria-hidden="true">
        {heights.map((h, i) => <span key={i} style={{ transform: `scaleY(${(h / WAVE_PX).toFixed(3)})` }} />)}
      </span>
      <span>{label}</span>
    </button>
  )
}
