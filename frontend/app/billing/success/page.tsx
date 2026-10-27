'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { PageContainer, PageHeader, buttonClass } from '@/components/ui'
import pg from '@/components/layout/page.module.css'
import { completeCheckout } from '@/lib/api'
import { PAYMENTS_ENABLED } from '@/lib/payments'
import { RACE_LIST_HREF } from '@/lib/routes'
import { useAccessStore } from '@/stores/accessStore'

type State = 'checking' | 'done' | 'failed' | 'off'

/** Where Stripe Checkout returns (block 44): the backend verifies the session and answers the token. */
function Success() {
  const sessionId = useSearchParams().get('session_id')
  const refresh = useAccessStore((s) => s.refresh)
  const [state, setState] = useState<State>(PAYMENTS_ENABLED ? 'checking' : 'off')
  const [invite, setInvite] = useState<string | null>(null)

  useEffect(() => {
    if (!PAYMENTS_ENABLED) return
    if (!sessionId) { setState('failed'); return }
    let live = true
    completeCheckout(sessionId)
      .then((r) => { if (live) setInvite(r.telegramInvite) })
      .then(() => refresh())
      .then(() => { if (live) setState('done') })
      .catch(() => { if (live) setState('failed') })
    return () => { live = false }
  }, [sessionId, refresh])

  const text: Record<State, string> = {
    checking: 'Confirming the payment with Stripe…',
    done: 'PRO is active on this browser. Thank you for supporting the project.',
    failed: 'This payment could not be confirmed. If you were charged, reload this page; if it still fails, write to the owner with the email you paid with.',
    off: 'Subscriptions open soon.',
  }

  return (
    <AppShell breadcrumb={[{ label: 'Subscription' }]}>
      <PageContainer width="reading">
        <PageHeader kicker="Subscription" title="PRO" meta={<span role="status" aria-live="polite">{text[state]}</span>} />
        <div className={pg.page}>
          {state === 'done' && <Link href={RACE_LIST_HREF} className={buttonClass('ink', true)}>Open the races</Link>}
          {state === 'done' && invite && (
            <p data-telegram-invite>
              The PRO channel on Telegram: <a href={invite} target="_blank" rel="noopener noreferrer">join it</a>. The link works once, for 24 hours.
            </p>
          )}
          {state !== 'done' && state !== 'checking' && <Link href="/" className={buttonClass('default', true)}>Back to the home page</Link>}
        </div>
      </PageContainer>
    </AppShell>
  )
}

export default function BillingSuccessPage() {
  return <Suspense><Success /></Suspense>
}
