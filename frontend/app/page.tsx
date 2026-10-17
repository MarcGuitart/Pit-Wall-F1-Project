import { AppShell } from '@/components/layout/AppShell'
import { AnchorBar } from '@/components/home/AnchorBar'
import { Hero } from '@/components/home/Hero'
import { NextSessionCard } from '@/components/home/NextSessionCard'
import { ProofStrip } from '@/components/home/ProofStrip'
import { Questions } from '@/components/home/Questions'
import { SampleAnalysis } from '@/components/home/SampleAnalysis'
import { LiveSection } from '@/components/home/LiveSection'
import { Plans } from '@/components/home/Plans'
import { Method } from '@/components/home/Method'
import { Faq } from '@/components/home/Faq'
import { Closing } from '@/components/home/Closing'
import { Reveal } from '@/components/home/Reveal'
import h from '@/components/home/home.module.css'

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
        <SampleAnalysis />
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
