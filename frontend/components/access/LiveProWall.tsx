'use client'

import Link from 'next/link'
import { AccessCodeForm } from '@/components/access/AccessCodeForm'
import { Badge, PageContainer, ui } from '@/components/ui'
import { RACE_LIST_HREF } from '@/lib/routes'

/**
 * /live without PRO (block 43): the design system's wall, as on /race, with
 * live mode's own copy, and the access-code form Settings uses (it unlocks
 * through the access store). Text at 11 px or more and 4.5:1 contrast or more.
 */
export function LiveProWall({ onUnlocked }: { onUnlocked: () => void }) {
  return (
    <PageContainer width="narrow">
      <section className={ui.panelBoxed} style={{ maxWidth: 560, width: '100%', marginInline: 'auto', background: 'var(--pw-bg)' }} aria-labelledby="live-wall-title">
        <div style={{ height: 8, background: 'repeating-linear-gradient(45deg, var(--pw-amber) 0 8px, var(--pw-bg) 8px 16px)' }} aria-hidden="true" />
        <div style={{ padding: 28, display: 'grid', gap: 14 }}>
          <div><Badge tone="warn">Pit Wall PRO</Badge></div>
          <h1 id="live-wall-title" className={ui.h1} style={{ fontSize: 'clamp(32px, 6vw, 48px)', margin: 0 }}>Live mode is PRO</h1>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: 'var(--pw-text)' }}>Live mode and races from 2025 are part of PRO.</p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--pw-text)' }}>Subscriptions are not open yet: access today is by a code.</p>
          <AccessCodeForm id="live-wall-code" onRedeemed={onUnlocked} />
          <div>
            <Link href={RACE_LIST_HREF} style={{ color: 'var(--pw-text)', fontSize: 13, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 4 }}>
              Back to the races
            </Link>
          </div>
        </div>
      </section>
    </PageContainer>
  )
}
