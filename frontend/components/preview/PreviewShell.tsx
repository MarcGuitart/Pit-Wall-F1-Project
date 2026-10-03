'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import s from '@/components/live/dashboard/live.module.css'
import p from './preview.module.css'
import { archivo } from '@/lib/fonts'
import { usePwTheme } from '@/lib/pwTheme'
import { ThemeToggle } from '@/components/live/dashboard/ThemeToggle'
import { useAccessStore } from '@/stores/accessStore'
import { useLiveStatus } from '@/hooks/useLiveStatus'

/**
 * The whole-site redesign, as a preview: the Modernist grid of the live page
 * applied to the landing and the race pages, on the same data. Lives under
 * /preview so the current site is untouched until the redesign is chosen.
 */
export function PreviewShell({ children, active }: { children: ReactNode; active: 'historical' | 'live' | 'docs' | 'settings' }) {
  const [theme, setTheme] = usePwTheme()
  const pro = useAccessStore(st => st.pro)
  const { liveSessionKey } = useLiveStatus(pro, new Date().getFullYear())
  return (
    <div className={`${s.root} ${archivo.className} ${archivo.variable} pw-modern`} data-theme={theme}>
      <div className={p.previewBar}>
        <span><b>Preview</b> · the whole site in the live-mode design, on real data. Nothing here replaces the current pages yet.</span>
        <Link href="/" className={p.previewLink}>Back to the current site →</Link>
      </div>
      <nav className={p.nav}>
        <Link href="/preview" className={p.brand}>PIT WALL <span>ENGINEER</span></Link>
        <div className={p.navLinks}>
          <Link href="/preview" className={`${p.navLink} ${active === 'historical' ? p.navOn : ''}`}>Historical</Link>
          <Link href="/preview/live" className={`${p.navLink} ${active === 'live' ? p.navOn : ''}`}>
            {liveSessionKey != null && <span className={p.liveDot} />}Live<span className={p.pro}>PRO</span>
          </Link>
          <Link href="/preview/docs" className={`${p.navLink} ${active === 'docs' ? p.navOn : ''}`}>Docs</Link>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <ThemeToggle theme={theme} onChange={setTheme} />
          {pro && <span className={p.pro} style={{ background: 'var(--pw-accent)', color: '#fff' }}>PRO</span>}
          <Link href="/preview/settings" className={`${s.btn} ${active === 'settings' ? s.segOn : ''}`}>Settings</Link>
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
