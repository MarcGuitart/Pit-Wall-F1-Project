/**
 * Public documentation — what Pit Wall Engineer is, what's free, what's PRO,
 * how live mode works at a high level, and where the data comes from.
 *
 * No code, no internal architecture: this is the page a visitor reads before
 * they know or care what a Zustand store or an SSE stream is. That level of
 * detail belongs in the repo's own README and docs/, for contributors.
 *
 * Server component — this content never changes per visitor, so it does not
 * need 'use client' or any store.
 */
import Link from 'next/link'
import { AppShell } from '@/components/layout/AppShell'
import { FREE_SEASONS, PRO_PRICE_LABEL } from '@/lib/access'
import { PRODUCT_NAME } from '@/lib/brand'

export const metadata = {
  title: `Docs — ${PRODUCT_NAME}`,
  description: `What ${PRODUCT_NAME} is, what is free, what PRO adds, and where the data comes from.`,
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 py-8 border-b border-border-subtle last:border-b-0">
      <h2 className="font-display font-black text-[20px] uppercase tracking-[-0.3px] text-text-primary mb-3">
        {title}
      </h2>
      <div className="font-body text-[14px] text-text-secondary leading-relaxed space-y-3">
        {children}
      </div>
    </section>
  )
}

const NAV = [
  { id: 'what-it-is', label: 'What it is' },
  { id: 'free', label: 'Free' },
  { id: 'pro', label: 'PRO' },
  { id: 'live', label: 'Live mode' },
  { id: 'data', label: 'Data sources' },
  { id: 'legal', label: 'Legal' },
]

export default function DocsPage() {
  return (
    <AppShell breadcrumb={[{ label: 'Docs' }]}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-display font-black text-[32px] md:text-[38px] leading-[0.95] uppercase tracking-[-0.5px] text-text-primary mb-2">
          Docs
        </h1>
        <p className="font-mono text-[11px] text-text-muted mb-8">
          What {PRODUCT_NAME} is, what is free, and what PRO adds.
        </p>

        {/* Section jump links */}
        <nav aria-label="Sections" className="flex flex-wrap gap-2 mb-4">
          {NAV.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              className="font-mono text-[10px] uppercase tracking-[0.5px] text-text-muted hover:text-signal-blue
                         border border-border-default rounded-[3px] px-2 py-1 transition-colors"
            >
              {n.label}
            </a>
          ))}
        </nav>

        <Section id="what-it-is" title="What it is">
          <p>
            {PRODUCT_NAME} turns raw Formula&nbsp;1 timing data into the kind of analysis a race
            engineer would actually run: true pace with pit stops and safety cars stripped out, tyre
            degradation, pit stop impact, race phases, weather crossovers, and a Chaos Index that scores
            how disordered a race was.
          </p>
          <p>
            Pick a season, a Grand Prix and a session, and the site builds a full strategic breakdown —
            then you can ask an AI race engineer questions about that specific race, grounded in its own
            computed analysis rather than a general-purpose model guessing from memory.
          </p>
        </Section>

        <Section id="free" title="Free">
          <p>
            Every race from{' '}
            <strong className="text-text-primary">{FREE_SEASONS.join(' and ')}</strong> — full
            analysis, every session type, no account and no code needed.
          </p>
        </Section>

        <Section id="pro" title="PRO">
          <p>{PRO_PRICE_LABEL}.</p>
          <p>
            PRO covers races from 2025 onwards, the current season as it is published (usually within a
            few hours of the chequered flag), and Live mode. Subscriptions are not open yet — access
            today is by a code, entered once in{' '}
            <Link href="/settings" className="text-signal-blue hover:underline underline-offset-4">
              Settings
            </Link>.
          </p>
        </Section>

        <Section id="live" title="Live mode">
          <p>
            During a session, Live mode shows the race as it happens: running order, gaps, pit stops and
            flags updating roughly every couple of seconds while the session is on. It is read-only —
            no predictions, no numbers that only make sense once the race has finished — and it clearly
            marks anything that cannot be judged reliably until the chequered flag, such as the Chaos
            Index, which needs the full race distance to mean anything.
          </p>
          <p>Live mode is part of PRO.</p>
        </Section>

        <Section id="data" title="Data sources">
          <p>
            Race and session data — laps, stints, pit stops, position, race control, weather — comes
            from{' '}
            <a href="https://openf1.org" target="_blank" rel="noopener noreferrer"
               className="text-signal-blue hover:underline underline-offset-4">
              OpenF1
            </a>, an open, free timing feed. Circuit telemetry (speed, throttle, brake, gear) comes from{' '}
            <a href="https://docs.fastf1.dev" target="_blank" rel="noopener noreferrer"
               className="text-signal-blue hover:underline underline-offset-4">
              FastF1
            </a>. Team radio clips are linked from Formula&nbsp;1&apos;s own archive and are never
            copied or stored on this site.
          </p>
        </Section>

        <Section id="legal" title="Legal">
          <p>
            Unofficial project, not associated in any way with the Formula 1 companies. F1, FORMULA 1
            and related marks are trademarks of Formula One Licensing B.V.
          </p>
        </Section>
      </div>
    </AppShell>
  )
}
