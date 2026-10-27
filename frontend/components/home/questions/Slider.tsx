'use client'

import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import q from './questions.module.css'

/**
 * A slider for the landing's demos (block 37): role="slider" with
 * aria-valuenow and aria-valuetext, arrow keys, Page Up and Down, Home and
 * End, and a pointer drag (mouse, pen or touch) on the track. touch-action is
 * off on the track only, so the page still scrolls everywhere else.
 */
export function Slider({ label, min, max, step, value, onChange, valueText }: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
  valueText: (v: number) => string
}) {
  const track = useRef<HTMLDivElement>(null)
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min))
  const set = (v: number) => { const c = Number(clamp(v).toFixed(6)); if (c !== value) onChange(c) }
  const fromPointer = (e: PointerEvent) => {
    const r = track.current!.getBoundingClientRect()
    set(min + ((e.clientX - r.left) / Math.max(1, r.width)) * (max - min))
  }
  const onKey = (e: KeyboardEvent) => {
    const big = Math.max(step, (max - min) / 10)
    const next = {
      ArrowRight: value + step, ArrowUp: value + step, ArrowLeft: value - step, ArrowDown: value - step,
      PageUp: value + big, PageDown: value - big, Home: min, End: max,
    }[e.key]
    if (next === undefined) return
    e.preventDefault()
    set(next)
  }
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className={q.slider}>
      <div className={q.sliderHead}>
        <span className={q.sliderLabel}>{label}</span>
        <span className={q.sliderValue} aria-hidden="true">{valueText(value)}</span>
      </div>
      <div
        ref={track}
        className={q.track}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText(value)}
        onKeyDown={onKey}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); fromPointer(e) }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e) }}
      >
        <span className={q.fill} style={{ transform: `scaleX(${pct / 100})` }} />
        <span className={q.thumbRail} style={{ transform: `translateX(${pct}%)` }}><span className={q.thumb} /></span>
      </div>
    </div>
  )
}
