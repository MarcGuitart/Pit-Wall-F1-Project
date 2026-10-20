import type { Metadata } from 'next'
import { AppShell } from '@/components/layout/AppShell'
import { FREE_SEASONS } from '@/lib/access'
import { AnchorBar } from '@/components/home/AnchorBar'
import { Hero } from '@/components/home/Hero'
import { NextSessionCard } from '@/components/home/NextSessionCard'
import { ProofStrip } from '@/components/home/ProofStrip'
import { Questions } from '@/components/home/Questions'
import { LiveSection } from '@/components/home/LiveSection'
import { Plans } from '@/components/home/Plans'
import { Method } from '@/components/home/Method'
import { Faq } from '@/components/home/Faq'
import { Closing } from '@/components/home/Closing'
import { Reveal } from '@/components/home/Reveal'
import h from '@/components/home/home.module.css'

const TITLE = 'Pit Wall Engineer · every race, read like an engineer would'
const DESCRIPTION = `Unofficial Formula 1 race strategy analysis: true pace from clean laps, tyre degradation, pit cycles and a measured Chaos Index, with the laps excluded and a confidence label on every estimate. Seasons ${FREE_SEASONS.join(' and ')} are free.`

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: 'https://pitwallengineer.com/' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: 'https://pitwallengineer.com/',
    siteName: 'Pit Wall Engineer',
    type: 'website',
    // Original artwork (public/og.svg, rasterised to 1200 × 630); no F1 imagery.
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Pit Wall Engineer · Every race, read like an engineer would.' }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: ['/og.png'] },
}

/**
 * "/" — the landing (Block 29, design/Landing.dc.html). Static: nothing here is
 * rendered per request. What changes — the next session, the figures, the live
 * state — is a client island with a 3 s timeout and a fixed height, so it
 * arriving or failing moves nothing. Header and footer are the AppShell's: one
 * <header>, one <footer>. The race list is /races.
 */
export default function HomePage() {
  return (
    <AppShell footerAttribution>
      <div className={h.page}>
        <AnchorBar />
        <Hero aside={<NextSessionCard />} />
        <ProofStrip />
        <Questions />
        <LiveSection />
        <Plans />
        <Method />
        <Faq />
        <Closing />
        <Reveal />
      </div>
    </AppShell>
  )
}
