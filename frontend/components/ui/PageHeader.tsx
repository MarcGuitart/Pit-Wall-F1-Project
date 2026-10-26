import type { ReactNode } from 'react'
import s from './ui.module.css'

/** Live's page header: kicker with the red square, giant uppercase title, meta line, right column. */
export function PageHeader({ kicker, title, meta, right }: {
  kicker: ReactNode
  title: ReactNode
  meta?: ReactNode
  right?: ReactNode
}) {
  return (
    <header className={s.header}>
      <div style={{ minWidth: 0 }}>
        <div className={s.kicker}><span className={s.square} aria-hidden="true" />{kicker}</div>
        <h1 className={s.h1}>{title}</h1>
        {meta && <div className={s.meta}>{meta}</div>}
      </div>
      {right && <div className={s.headRight}>{right}</div>}
    </header>
  )
}
