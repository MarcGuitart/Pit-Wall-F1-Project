import type { CSSProperties, ElementType, ReactNode } from 'react'
import s from './ui.module.css'

type PanelProps = {
  title?: ReactNode
  /** One line under/next to the title: what the panel measures. */
  sub?: ReactNode
  /** Right-aligned in the header: a count, a badge, a control. */
  aside?: ReactNode
  /** Small print under the body: method, sources, caveats. */
  foot?: ReactNode
  /** Heading element for the title; panels inside a page section are h3. */
  as?: ElementType
  /** Draw its own 2px frame (a panel on its own, not inside a Cells grid). */
  boxed?: boolean
  wide?: boolean
  id?: string
  className?: string
  style?: CSSProperties
  bodyClassName?: string
  /** false: children own their padding (tables, charts, lists). */
  padded?: boolean
  children?: ReactNode
}

/** A titled block of the Modernist grid: header rule, body, optional foot. */
export function Panel({ title, sub, aside, foot, as: H = 'h3', boxed, wide, id, className = '', style, bodyClassName = '', padded = true, children }: PanelProps) {
  return (
    <section id={id} className={`${s.panel} ${boxed ? s.panelBoxed : ''} ${className}`} style={style} aria-labelledby={title && id ? `${id}-title` : undefined}>
      {(title || aside) && (
        <div className={`${s.secHead} ${wide ? s.secHeadWide : ''}`}>
          {title && <H className={s.h6} id={id ? `${id}-title` : undefined}>{title}</H>}
          {sub && <span className={s.sub}>{sub}</span>}
          {aside && <span className={s.secAside}>{aside}</span>}
        </div>
      )}
      {children != null && <div className={`${padded ? s.body : ''} ${bodyClassName}`} style={{ minWidth: 0 }}>{children}</div>}
      {foot && <div className={s.foot}>{foot}</div>}
    </section>
  )
}

/** Panels side by side with 2px rules between them; columns collapse on narrow screens. */
export function Cells({ min = 320, cols, className = '', style, children, ruled, boxed }: {
  /** Minimum column width for auto-fit. */
  min?: number
  /** Fixed column count above the collapse width. */
  cols?: number
  className?: string
  style?: CSSProperties
  ruled?: boolean
  boxed?: boolean
  children: ReactNode
}) {
  const template = cols ? `repeat(${cols}, minmax(0, 1fr))` : `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`
  return (
    <div className={`${s.cells} ${ruled ? s.ruled : ''} ${boxed ? s.boxed : ''} ${cols ? s.cellsFixed : ''} ${className}`} style={{ gridTemplateColumns: template, ...style }}>
      {children}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className={s.empty}>{children}</div>
}
