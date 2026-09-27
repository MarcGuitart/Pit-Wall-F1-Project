/**
 * The one site footer. AppShell renders this on every page.
 *
 * It used to also be redefined, word for word, inside app/page.tsx — the home
 * page rendered both AppShell's SiteFooter and its own <footer>, so the legal
 * disclaimer appeared twice, stacked. The author/LinkedIn/CV block was the only
 * part that was genuinely home-only, so it survives here as an optional prop
 * rather than a second footer.
 */
type SiteFooterProps = {
  /** The "Project Implemented by" block with LinkedIn and CV links. Home only. */
  attribution?: boolean
}

export function SiteFooter({ attribution = false }: SiteFooterProps) {
  return (
    <footer className="border-t border-border-subtle px-6 py-4">
      <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-4">
        <p className="font-mono text-[10px] text-text-muted leading-relaxed max-w-xl">
          Unofficial project, not associated in any way with the Formula 1 companies. F1, FORMULA 1
          and related marks are trademarks of Formula One Licensing B.V. Data via{' '}
          <span className="text-text-secondary">OpenF1</span> &amp; FastF1; team radio clips are
          linked from Formula 1&apos;s archive and are not stored here.
        </p>

        {attribution && (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="font-mono text-[9px] text-text-muted">Project Implemented by</div>
              <div className="font-display font-bold text-[11px] uppercase tracking-[1px] text-text-primary">
                Marc Guitart Frescó
              </div>
            </div>

            <a
              href="https://www.linkedin.com/in/marc-guitart-fresco/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border-subtle rounded-[3px] hover:border-signal-blue hover:text-signal-blue text-text-muted transition-all"
              aria-label="LinkedIn profile"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
              <span className="font-display font-bold text-[9px] uppercase tracking-[1px]">LinkedIn</span>
            </a>

            <a
              href="/cv.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border-subtle rounded-[3px] hover:border-signal-green hover:text-signal-green text-text-muted transition-all"
              aria-label="Download CV"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <polyline points="9 15 12 18 15 15"/>
              </svg>
              <span className="font-display font-bold text-[9px] uppercase tracking-[1px]">CV</span>
            </a>
          </div>
        )}
      </div>
    </footer>
  )
}
