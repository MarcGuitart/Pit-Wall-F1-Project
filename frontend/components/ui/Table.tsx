import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import s from './ui.module.css'

/**
 * Live's timing-table rows: CSS grid rows sharing one column template, a
 * surface-coloured header, 1px rules between rows. Scrolls sideways on a
 * narrow screen instead of squeezing the numbers. ARIA table roles keep it a
 * table for a screen reader.
 */
export type Column = { key: string; label: ReactNode; width: string; num?: boolean; title?: string }

export function DataTable({ columns, label, children, className = '', style }: {
  columns: Column[]
  /** Accessible name for the table. */
  label: string
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const template = columns.map((c) => c.width).join(' ')
  return (
    <div className={`${s.tableScroll} ${className}`} style={style}>
      <div role="table" aria-label={label} style={{ ['--pw-cols' as string]: template }}>
        <div role="row" className={s.tHead} style={{ gridTemplateColumns: template }}>
          {columns.map((c) => <div key={c.key} role="columnheader" title={c.title} className={`${s.th} ${c.num ? s.num : ''}`}>{c.label}</div>)}
        </div>
        <div role="rowgroup">{children}</div>
      </div>
    </div>
  )
}

/**
 * One row. With onActivate the row is a button for mouse and keyboard
 * (Enter/Space), which is how a driver row opens the driver card.
 */
export function Row({ children, onActivate, selected, label, className = '', style }: {
  children: ReactNode
  onActivate?: () => void
  selected?: boolean
  label?: string
  className?: string
  style?: CSSProperties
}) {
  const key = (e: KeyboardEvent) => {
    if (onActivate && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onActivate() }
  }
  return (
    <div
      role="row"
      className={`${s.tRow} ${onActivate ? s.tRowAction : ''} ${selected ? s.tRowOn : ''} ${className}`}
      style={{ gridTemplateColumns: 'var(--pw-cols)', ...style }}
      onClick={onActivate}
      onKeyDown={key}
      tabIndex={onActivate ? 0 : undefined}
      aria-label={label}
      aria-selected={onActivate ? !!selected : undefined}
    >
      {children}
    </div>
  )
}

export function Cell({ children, num, className = '', style, title }: { children?: ReactNode; num?: boolean; className?: string; style?: CSSProperties; title?: string }) {
  return <div role="cell" title={title} className={`${s.td} ${num ? s.num : ''} ${className}`} style={style}>{children}</div>
}
