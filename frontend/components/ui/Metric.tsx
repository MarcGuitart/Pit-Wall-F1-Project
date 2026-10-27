import type { ReactNode } from 'react'
import s from './ui.module.css'

/**
 * One reading: uppercase label, heavy tabular value, a muted line of context.
 * `cell` wraps it as a grid cell (inside <Cells>); without it, it sits inline.
 */
export function Metric({ label, value, sub, size = 'big', accent, cell = true, tight, className = '' }: {
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  size?: 'big' | 'mid' | 'small'
  accent?: boolean
  cell?: boolean
  tight?: boolean
  className?: string
}) {
  return (
    <div className={`${cell ? s.cell : ''} ${tight ? s.cellTight : ''} ${className}`}>
      <div className={s.label}>{label}</div>
      <div className={`${s[size]} ${accent ? s.accent : ''}`}>{value}</div>
      {sub != null && <div className={s.sub}>{sub}</div>}
    </div>
  )
}
