import type { CSSProperties } from 'react'
import s from './ui.module.css'

/**
 * A placeholder block in the surface colour. It stands for layout, never for
 * data: no fake numbers, no fake labels. Pulses unless reduced motion is set.
 */
export function Skeleton({ width = '100%', height = 12, text, pulse = true, style, className = '' }: {
  width?: number | string
  height?: number | string
  /** A line of text: 12px tall with its own vertical margin. */
  text?: boolean
  pulse?: boolean
  style?: CSSProperties
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={`${s.skel} ${text ? s.skelText : ''} ${pulse ? s.skelPulse : ''} ${className}`}
      style={{ width, height: text ? undefined : height, ...style }}
    />
  )
}
