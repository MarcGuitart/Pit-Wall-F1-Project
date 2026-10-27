'use client'

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { leastSquares } from '@/lib/questionsMath'
import q from './questions.module.css'

// Tyre age 1 to 6 against an abstract lap time (higher is slower).
const START = [30, 34, 36, 41, 44, 49]
const W = 240
const H = 120
const PAD = 14
const MAX = 100
const xOf = (i: number) => PAD + (i * (W - 2 * PAD)) / (START.length - 1)
const yOf = (v: number) => H - PAD - (v / MAX) * (H - 2 * PAD)

/**
 * Q2: drag the laps; the fit (the backend's least squares) and its slope
 * follow. The slope is the degradation. No threshold, no risk label.
 */
export function Q2Tyre() {
  const [ys, setYs] = useState(START)
  const svg = useRef<SVGSVGElement>(null)
  const fit = leastSquares(ys.map((y, i) => ({ x: i + 1, y })))
  const setAt = (i: number, v: number) => setYs((cur) => cur.map((y, j) => (j === i ? Math.min(MAX, Math.max(0, Math.round(v))) : y)))
  const fromPointer = (i: number, e: PointerEvent<SVGCircleElement>) => {
    const r = svg.current!.getBoundingClientRect()
    const py = ((e.clientY - r.top) / Math.max(1, r.height)) * H
    setAt(i, ((H - PAD - py) / (H - 2 * PAD)) * MAX)
  }
  const onKey = (i: number, e: KeyboardEvent) => {
    const step = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[e.key]
    if (e.key === 'Home') { e.preventDefault(); setAt(i, 0); return }
    if (e.key === 'End') { e.preventDefault(); setAt(i, MAX); return }
    if (step === undefined) return
    e.preventDefault()
    setAt(i, ys[i] + step)
  }
  const slope = fit ? fit.slope : 0
  return (
    <div className={q.demo}>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className={q.svg}>
        <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="var(--pw-divider)" />
        {fit && (
          <line
            x1={xOf(0)} y1={yOf(fit.intercept + fit.slope * 1)}
            x2={xOf(START.length - 1)} y2={yOf(fit.intercept + fit.slope * START.length)}
            stroke="var(--pw-accent)" strokeWidth="3"
          />
        )}
        {ys.map((y, i) => (
          <circle
            key={i}
            className={q.point}
            cx={xOf(i)}
            cy={yOf(y)}
            r="9"
            fill="currentColor"
            role="slider"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label={`Lap ${i + 1} of the stint`}
            aria-valuemin={0}
            aria-valuemax={MAX}
            aria-valuenow={y}
            aria-valuetext={`Lap ${i + 1} of the stint: ${y} of ${MAX}, higher is slower`}
            onKeyDown={(e) => onKey(i, e)}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); fromPointer(i, e) }}
            onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(i, e) }}
          />
        ))}
      </svg>
      <p className={q.readout} aria-live="polite">
        Slope <b>{slope >= 0 ? '+' : ''}{slope.toFixed(1)}</b> per lap of tyre age
      </p>
    </div>
  )
}
