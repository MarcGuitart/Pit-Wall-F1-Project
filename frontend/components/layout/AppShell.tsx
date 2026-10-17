'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { TopBar } from './TopBar'
import { SiteFooter } from './SiteFooter'
import { PwRoot } from '@/components/ui'
import dynamic from 'next/dynamic'
import { usePendingRace } from '@/lib/raceNav'
import { useSessionMeta } from '@/lib/sessionMeta'
import { raceBreadcrumb } from '@/lib/sessionFacts'
import s from './shell.module.css'

// Loaded on demand: only a click on a race needs it, and every page renders
// the shell. It has the 300 ms grace to arrive before anything is shown.
const AnalysisLoadingScreen = dynamic(
  () => import('@/components/analysis/AnalysisLoadingScreen').then((m) => m.AnalysisLoadingScreen),
  { ssr: false },
)

type BreadcrumbItem = {
  label: string
  href?: string
}

type AppShellProps = {
  children: React.ReactNode
  breadcrumb?: BreadcrumbItem[]
  /** Show the author/LinkedIn/CV block in the footer. Home only. */
  footerAttribution?: boolean
}

/**
 * Every page's frame: the design system's root (tokens, Archivo, dark
 * ground), the top bar, the page and the footer.
 */
export function AppShell({ children, breadcrumb, footerAttribution = false }: AppShellProps) {
  // A race was clicked and its route has not arrived yet (lib/raceNav.ts):
  // show the analysis loader now instead of leaving this page on screen.
  const pathname = usePathname()
  const pending = usePendingRace((st) => st.pending)
  const clear = usePendingRace((st) => st.set)
  const waiting = pending != null && pathname !== pending.href
  useEffect(() => { if (pending && pathname === pending.href) clear(null) }, [pathname, pending, clear])
  const { meta: pendingMeta } = useSessionMeta(waiting ? pending.key : null)

  return (
    <PwRoot className={s.shell}>
      <TopBar breadcrumb={waiting ? raceBreadcrumb(pendingMeta) : breadcrumb} />
      <main className={s.main}>
        {waiting ? <AnalysisLoadingScreen sessionKey={pending.key} /> : children}
      </main>
      <SiteFooter attribution={footerAttribution} />
    </PwRoot>
  )
}
