/**
 * The one site footer. AppShell renders this on every page.
 *
 * It used to also be redefined, word for word, inside app/page.tsx — the home
 * page rendered both AppShell's SiteFooter and its own <footer>, so the legal
 * disclaimer appeared twice, stacked. Block 32: the author line, with LinkedIn
 * and the CV as buttons in the system's style, is on every page now, not only
 * the home. URL and file are the ones main's footer had (public/cv.pdf).
 */
import Link from 'next/link'
import { buttonClass } from '@/components/ui'
import s from './shell.module.css'

export function SiteFooter() {
  return (
    <footer className={s.footer}>
      <p>
        <Link href="/docs">Docs</Link>
        {' · '}
        Unofficial project, not associated in any way with the Formula 1 companies. F1, FORMULA 1
        and related marks are trademarks of Formula One Licensing B.V. Data via{' '}
        <b style={{ color: 'var(--pw-text)', fontWeight: 600 }}>OpenF1</b> &amp; FastF1; team radio clips are
        linked from Formula 1&apos;s archive and are not stored here.
      </p>

      <div className={s.attribution}>
          <div>
            <span>Project implemented by</span>
            <b>Marc Guitart Frescó</b>
          </div>

          <a
            href="https://www.linkedin.com/in/marc-guitart-fresco/"
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass()}
            aria-label="LinkedIn profile"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            LinkedIn
          </a>

          <a
            href="/cv.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass()}
            aria-label="Download CV"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <polyline points="9 15 12 18 15 15"/>
            </svg>
            CV
          </a>
      </div>
    </footer>
  )
}
