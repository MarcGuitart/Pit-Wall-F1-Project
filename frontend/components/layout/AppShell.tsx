'use client'

import { TopBar } from './TopBar'
import { SiteFooter } from './SiteFooter'
import { PwRoot } from '@/components/ui'
import s from './shell.module.css'

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
  return (
    <PwRoot className={s.shell}>
      <TopBar breadcrumb={breadcrumb} />
      <main className={s.main}>
        {children}
      </main>
      <SiteFooter attribution={footerAttribution} />
    </PwRoot>
  )
}
