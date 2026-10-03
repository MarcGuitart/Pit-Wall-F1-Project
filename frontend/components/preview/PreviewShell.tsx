'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import s from '@/components/live/dashboard/live.module.css'
import p from './preview.module.css'
import { archivo } from '@/lib/fonts'
import { useAccessStore } from '@/stores/accessStore'
import { useLiveStatus } from '@/hooks/useLiveStatus'

/**
 * The whole-site redesign, as a preview: the Modernist grid of the live page
 * applied to the landing and the race pages, on the same data. Lives under
 * /preview so the current site is untouched until the redesign is chosen.
 */
export function PreviewShell({ children, active }: { children: ReactNode; active: 'historical' | 'live' | 'docs' }) {
  const pro = useAccessStore(st => st.pro)
  const { liveSessionKey } = useLiveStatus(pro, new Date().getFullYear())
  return (
    <div className={`${s.root} ${archivo.className}`}>
      <div className={p.previewBar}>
        <span><b>Preview</b> · the whole site in the live-mode design, on real data. Nothing here replaces the current pages yet.</span>
        <Link href="/" className={p.previewLink}>Back to the current site →</Link>
      </div>
      <nav className={p.nav}>
        <Link href="/preview" className={p.brand}>PIT WALL <span>ENGINEER</span></Link>
        <div className={p.navLinks}>
          <Link href="/preview" className={`${p.navLink} ${active === 'historical' ? p.navOn : ''}`}>Historical</Link>
          {liveSessionKey != null
            ? <Link href={`/live/${liveSessionKey}`} className={`${p.navLink} ${active === 'live' ? p.navOn : ''}`}><span className={p.liveDot} />Live<span className={p.pro}>PRO</span></Link>
            : <span className={`${p.navLink} ${p.navOff}`} title="No session is live right now">Live<span className={p.pro}>PRO</span></span>}
          <Link href="/docs" className={`${p.navLink} ${active === 'docs' ? p.navOn : ''}`}>Docs</Link>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {pro && <span className={p.pro} style={{ background: 'var(--pw-accent)', color: '#fff' }}>PRO</span>}
          <Link href="/settings" className={s.btn}>Settings</Link>
        </div>
      </nav>
      {children}
      <footer className={s.footer}>
        Unofficial project, not associated in any way with the Formula 1 companies. F1, FORMULA 1 and related marks are
        trademarks of Formula One Licensing B.V. Data via OpenF1 and FastF1.
      </footer>
    </div>
  )
}
