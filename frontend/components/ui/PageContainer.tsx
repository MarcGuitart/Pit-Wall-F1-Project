import type { ReactNode } from 'react'
import s from './ui.module.css'

/**
 * The width and centring of text pages (block 32, task 6): Docs, Settings,
 * the 404, the PRO wall and the session-unavailable state. It only centres
 * and caps the width; the header and the body inside keep their own gutter
 * (--pw-gutter), so nothing is padded twice.
 *
 *   reading  Docs: up to 1200 px; the page lays out a ~70-character column
 *            and, from 1024 px, a fixed index beside it.
 *   narrow   one card or form: up to 40rem.
 *
 * data-page-container is what the geometry check measures (centred ±2 px).
 */
export function PageContainer({ width, children }: { width: 'reading' | 'narrow'; children: ReactNode }) {
  return (
    <div className={`${s.pageContainer} ${width === 'narrow' ? s.pageNarrow : s.pageReading}`} data-page-container={width}>
      {children}
    </div>
  )
}
