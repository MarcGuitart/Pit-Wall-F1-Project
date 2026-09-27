'use client'

import { TopBar } from './TopBar'
import { SiteFooter } from './SiteFooter'

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

export function AppShell({ children, breadcrumb, footerAttribution = false }: AppShellProps) {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col">
      <TopBar breadcrumb={breadcrumb} />
      <main className="flex-1 overflow-x-hidden">
        {children}
      </main>
      <SiteFooter attribution={footerAttribution} />
    </div>
  )
}
