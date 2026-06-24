import { AppShell } from '@/components/layout/AppShell'
import { RaceSelector } from '@/components/landing/RaceSelector'
import { LandingVideoBackground } from '@/components/landing/LandingVideoBackground'

const STEPS = [
  { num: '01', title: 'Select a session', sub: 'Season, race and session type' },
  { num: '02', title: 'Decode the strategy', sub: 'Pace, tyres, pit cycles, chaos' },
  { num: '03', title: 'Ask the race engineer', sub: 'Grounded answers from session data' },
]

export default function HomePage() {
  return (
    <AppShell>
      <div className="min-h-[calc(100vh-48px)] flex flex-col">
        {/* Hero */}
        <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-16 overflow-hidden">
          {/* Video background */}
          <LandingVideoBackground />

          {/* Grid background */}
          <div
            className="absolute inset-0 bg-grid-pattern bg-grid opacity-60 pointer-events-none"
            aria-hidden="true"
          />
          {/* Radial gradient vignette */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse 70% 60% at 50% 50%, transparent 30%, #05060A 100%)',
            }}
            aria-hidden="true"
          />

          <div className="relative z-10 text-center max-w-5xl mx-auto">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-bg-panel border border-border-subtle rounded-full mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-signal-red animate-pulse" />
              <span className="font-display font-bold text-[9px] uppercase tracking-[2px] text-text-secondary">
                Race Intelligence Dashboard
              </span>
            </div>

            {/* Main headline */}
            <h1 className="font-display font-black text-[56px] md:text-[80px] leading-[0.9] uppercase tracking-[-1px] mb-6">
              <span className="text-text-primary block">SEE THE RACE</span>
              <span className="text-signal-red block">LIKE THEY DO.</span>
            </h1>

            {/* Updated tagline */}
            <p className="font-body text-[16px] text-text-secondary leading-relaxed max-w-xl mx-auto mb-12">
              Decode true pace, tyre cliff risk, pit cycles and race-control disruption —
              the signals behind every strategy call.
            </p>

            {/* Stats strip */}
            <div className="flex items-center justify-center gap-12 mb-12 flex-wrap">
              {[
                { value: '50K+', label: 'Data Points Per Session', sub: 'pos · intervals · car data · weather' },
                { value: '12', label: 'Analysis Modules', sub: 'pace · tyre · pit · chaos · DRS · DNA…' },
                { value: '40+', label: 'Strategic Signals', sub: 'engineer notes · decisions · phases' },
              ].map(({ value, label, sub }) => (
                <div key={label} className="text-center">
                  <div className="font-display font-black text-[28px] md:text-[34px] text-text-primary leading-none">
                    {value}
                  </div>
                  <div className="font-display font-bold text-[9px] uppercase tracking-[1.5px] text-text-muted mt-1">
                    {label}
                  </div>
                  <div className="font-mono text-[8px] text-text-muted/60 mt-0.5 max-w-[120px] mx-auto leading-tight">
                    {sub}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Three-step explanation block */}
        <div className="w-full bg-bg-secondary border-y border-border-subtle">
          <div className="max-w-5xl mx-auto px-6 py-4 grid grid-cols-3 divide-x divide-border-subtle">
            {STEPS.map((step) => (
              <div key={step.num} className="px-6 flex items-center gap-4">
                <span
                  className="font-display font-black text-[28px] leading-none select-none shrink-0"
                  style={{ color: 'rgba(232,0,29,0.45)' }}
                >
                  {step.num}
                </span>
                <div>
                  <div className="font-display font-bold text-[13px] uppercase tracking-[0.5px] text-text-primary">
                    {step.title}
                  </div>
                  <div className="font-mono text-[10px] text-text-muted mt-0.5">
                    {step.sub}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Selector section */}
        <div className="px-6 py-8 max-w-5xl mx-auto w-full">
          <RaceSelector />
        </div>

        {/* Footer */}
        <footer className="border-t border-border-subtle px-6 py-5">
          <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-4">
            <p className="font-mono text-[10px] text-text-muted">
              Unofficial project · Data via{' '}
              <span className="text-text-secondary">OpenF1</span> &amp; FastF1 · Not affiliated with Formula 1 or FIA
            </p>

            {/* Author block */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="font-mono text-[9px] text-text-muted">Project Implemented by</div>
                <div className="font-display font-bold text-[11px] uppercase tracking-[1px] text-text-primary">
                  Marc Guitart Frescó
                </div>
                
              </div>

              {/* LinkedIn */}
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

              {/* CV / Resume */}
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
          </div>
        </footer>
      </div>
    </AppShell>
  )
}
