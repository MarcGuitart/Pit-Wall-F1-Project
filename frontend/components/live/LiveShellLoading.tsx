'use client'

import { PageContainer, PageHeader, ui } from '@/components/ui'

/**
 * What the shell shows while a live route is on its way (block 34): after a
 * click to /live/[k] and until the route arrives, so the sweep, at 8 s,
 * uncovers this rather than the page that was left.
 */
export function LiveShellLoading() {
  return (
    <PageContainer width="reading">
      <PageHeader kicker="Live mode" title="Live" meta={<span role="status">Opening live mode. The live server can take a few seconds to answer.</span>} />
      <div aria-busy="true" style={{ display: 'grid', gap: 12, padding: '8px 0 32px' }}>
        {[60, 90, 75].map((w) => (
          <span key={w} className={ui.empty} style={{ display: 'block', height: 18, width: `${w}%`, background: 'var(--pw-divider)', padding: 0 }} aria-hidden="true" />
        ))}
      </div>
    </PageContainer>
  )
}
