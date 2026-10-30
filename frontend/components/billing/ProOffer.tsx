'use client'

import Link from 'next/link'
import { PAYMENTS_ENABLED } from '@/lib/paymentsFlag'
import { ui } from '@/components/ui'
import { LazySubscribeButton as SubscribeButton } from './lazy'

/**
 * What every PRO wall offers besides the access code (block 44b), so a wall is never a dead end once the open
 * week has ended: with payments on, Subscribe and the way back for someone who already pays; off, when.
 */
export function ProOffer({ id = 'subscribe' }: { id?: string }) {
  if (!PAYMENTS_ENABLED) {
    return <p className={ui.sub} style={{ margin: 0 }} data-pro-offer="soon">Subscriptions open soon. An access code opens PRO today.</p>
  }
  return (
    <div style={{ display: 'grid', gap: 8 }} data-pro-offer="subscribe">
      <SubscribeButton id={id} />
      <p className={ui.sub} style={{ margin: 0 }}>Already subscribed on another browser? <Link href="/billing/restore">Restore access</Link></p>
    </div>
  )
}
