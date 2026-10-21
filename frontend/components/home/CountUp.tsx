'use client'

import { useEffect, useState } from 'react'

const DURATION_MS = 600

/**
 * A figure that counts up from zero once, when its data has arrived (block
 * 37). Under reduced motion it shows the value at once. Only text changes:
 * nothing is animated by CSS.
 */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(value)
  useEffect(() => {
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || typeof requestAnimationFrame === 'undefined' || value <= 0) { setShown(value); return }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / DURATION_MS)
      setShown(Math.round(value * (1 - (1 - p) ** 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    setShown(0)
    raf = requestAnimationFrame(tick)
    // Frames pause in a background tab: the real value is never left half counted.
    const done = setTimeout(() => setShown(value), DURATION_MS + 50)
    return () => { cancelAnimationFrame(raf); clearTimeout(done) }
  }, [value])
  return <>{format(shown)}</>
}
