import { AppShell } from '@/components/layout/AppShell'
import { RaceSelector } from '@/components/landing/RaceSelector'

export default function HomePage() {
  return (
    <AppShell>
      <div className="min-h-[calc(100vh-48px)] flex flex-col">
        {/* Hero */}
        <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-16 overflow-hidden">
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

            {/* Tagline */}
            <p className="font-body text-[16px] text-text-secondary leading-relaxed max-w-xl mx-auto mb-12">
              True pace rankings, tyre degradation slopes, pit stop impact analysis — the
              same signals your race engineer is watching.
            </p>

            {/* Stats strip */}
            <div className="flex items-center justify-center gap-8 mb-12 flex-wrap">
              {[
                { value: '8', label: 'Analysis Modules' },
                { value: '71', label: 'Laps Decoded' },
                { value: '100', label: 'Max Chaos Score' },
              ].map(({ value, label }) => (
                <div key={label} className="text-center">
                  <div className="font-display font-black text-[32px] text-text-primary">
                    {value}
                  </div>
                  <div className="font-display font-bold text-[9px] uppercase tracking-[1.5px] text-text-muted">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Selector section */}
        <div className="px-6 pb-8 max-w-5xl mx-auto w-full">
          <RaceSelector />
        </div>

        {/* Footer */}
        <footer className="border-t border-border-subtle px-6 py-4 text-center">
          <p className="font-mono text-[10px] text-text-muted">
            Unofficial project · Data via{' '}
            <span className="text-text-secondary">OpenF1</span> · Not affiliated
            with Formula 1 or FIA
          </p>
        </footer>
      </div>
    </AppShell>
  )
}
