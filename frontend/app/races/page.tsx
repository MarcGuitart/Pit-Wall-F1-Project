import type { Metadata } from 'next'
import { AppShell } from '@/components/layout/AppShell'
import { RaceSelector } from '@/components/landing/RaceSelector'
import { SeasonGrid } from '@/components/landing/SeasonGrid'
import { PageHeader, ui } from '@/components/ui'
import { FREE_SEASONS } from '@/lib/access'

export const metadata: Metadata = {
  title: 'Races · Pit Wall Engineer',
  description: 'Every analysed Formula 1 session, season by season: pick a race for the full strategy analysis.',
  alternates: { canonical: 'https://pitwallengineer.com/races' },
}

/**
 * The race list (Block 29): the season grid and the session selector with the
 * featured races, moved here from "/" — which is now the landing. "Back to
 * race list", the logo's neighbour "Historical" and every CTA land here.
 */
export default function RacesPage() {
  return (
    <AppShell breadcrumb={[{ label: 'Races' }]}>
      <PageHeader
        kicker="Historical"
        title="Races"
        meta={<span>Pick a Grand Prix for its full analysis. Seasons {FREE_SEASONS.join(' and ')} are free.</span>}
      />
      <SeasonGrid />
      <section className={ui.section} aria-labelledby="any-session">
        <div className={`${ui.secHead} ${ui.secHeadWide}`}>
          <h2 className={ui.h6} id="any-session">Any session</h2>
          <span className={ui.sub}>Practice, qualifying, sprint and race — and the featured races</span>
        </div>
        <RaceSelector />
      </section>
    </AppShell>
  )
}
