'use client'

import { TopBar } from './TopBar'

type BreadcrumbItem = {
  label: string
  href?: string
}

type AppShellProps = {
  children: React.ReactNode
  breadcrumb?: BreadcrumbItem[]
}

export function AppShell({ children, breadcrumb }: AppShellProps) {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col">
      <TopBar breadcrumb={breadcrumb} />
      <main className="flex-1 overflow-x-hidden">
        {children}
      </main>
    </div>
  )
}
