import { AppShell } from '@/components/layout/AppShell'
import { AnchorBar } from '@/components/home/AnchorBar'
import { Hero } from '@/components/home/Hero'
import { Questions } from '@/components/home/Questions'
import { Method } from '@/components/home/Method'
import { Faq } from '@/components/home/Faq'
import { Closing } from '@/components/home/Closing'
import h from '@/components/home/home.module.css'

/**
 * "/" — the landing (Block 29, design/Landing.dc.html). Static: nothing here is
 * rendered per request; what is live (next session, figures, live state) is a
 * client island with a 3 s timeout. Header and footer are the AppShell's: one
 * <header>, one <footer>. The race list is /races.
 */
export default function HomePage() {
  return (
    <AppShell footerAttribution>
      <div className={h.page}>
        <AnchorBar />
        <Hero />
        <Questions />
        <Method />
        <Faq />
        <Closing />
      </div>
    </AppShell>
  )
}
