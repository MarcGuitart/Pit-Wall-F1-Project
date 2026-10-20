import Link from 'next/link'
import { AppShell } from '@/components/layout/AppShell'
import { PageContainer, PageHeader, buttonClass } from '@/components/ui'
import pg from '@/components/layout/page.module.css'

/** Next's 404, inside the site's shell. Same words as Next's default page. */
export default function NotFound() {
  return (
    <AppShell>
      <PageContainer width="reading">
      <PageHeader kicker="404" title="404" meta={<span>This page could not be found.</span>} />
      <div className={pg.page}>
        <Link href="/races" className={buttonClass('ink', true)}>Back to the race list</Link>
      </div>
      </PageContainer>
    </AppShell>
  )
}
