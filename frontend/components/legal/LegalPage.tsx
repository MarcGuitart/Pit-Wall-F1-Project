'use client'

import type { ReactNode } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageContainer, PageHeader } from '@/components/ui'
import pg from '@/components/layout/page.module.css'

/**
 * Terms, Privacy and Refunds (block 44b): a structure with the facts the code establishes, and visible gaps,
 * written {{like this}}, for everything the owner decides. Not legal advice and not a finished text: the page
 * says so, and it is not ready to take real money while a gap is left.
 */
export function Gap({ children }: { children: string }) {
  return <mark data-legal-gap style={{ padding: '0 4px', background: 'var(--pw-accent-tint, #fff2ef)', color: 'inherit' }}>{`{{${children}}}`}</mark>
}

export function LegalPage({ title, updated, children }: { title: string; updated: ReactNode; children: ReactNode }) {
  return (
    <AppShell breadcrumb={[{ label: title }]}>
      <PageContainer width="reading">
        <PageHeader kicker="Pit Wall Engineer" title={title} meta={<>Last updated: {updated}</>} />
        <div className={pg.page} style={{ display: 'grid', gap: 16, lineHeight: 1.6 }}>
          <p role="note" style={{ margin: 0, fontWeight: 700 }}>
            Draft. Every highlighted gap is for the owner to fill in; this page is not legal advice.
          </p>
          {children}
        </div>
      </PageContainer>
    </AppShell>
  )
}
