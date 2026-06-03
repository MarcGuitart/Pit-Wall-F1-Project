'use client'

import { useEffect, useState } from 'react'
import { useRaceStore } from '@/stores/raceStore'

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
      onClick={() => setRadioOpen(true)}
      disabled={!analysis}
      className="flex items-center gap-2 px-3 py-1.5 bg-bg-panel border border-border-subtle rounded-[3px] hover:border-border-default hover:bg-bg-elevated transition-all disabled:opacity-40 disabled:cursor-not-allowed group"
      title={analysis ? 'Talk to Race Engineer' : 'Load a race first'}
    >
      {/* Animated waveform bars */}
      <div className="flex items-end gap-[1.5px]" style={{ height: '14px' }}>
        {heights.map((h, i) => (
          <div
            key={i}
            className="rounded-sm transition-all"
            style={{
              width: '2px',
              height: `${h}px`,
              backgroundColor: analysis ? '#23D18B' : '#252D3A',
              transitionDuration: '280ms',
            }}
          />
        ))}
      </div>
      <span className="font-display font-bold text-[10px] uppercase tracking-[1px] text-text-secondary group-hover:text-text-primary transition-colors whitespace-nowrap">
        {label}
      </span>
    </button>
  )
}
