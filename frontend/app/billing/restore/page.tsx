'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { PageContainer, PageHeader, buttonClass, ui } from '@/components/ui'
import pg from '@/components/layout/page.module.css'
import { redeemRestore, requestRestore } from '@/lib/billingApi'
import { PAYMENTS_ENABLED } from '@/lib/payments'
import { RACE_LIST_HREF } from '@/lib/routes'
import { useAccessStore } from '@/stores/accessStore'

/**
 * Restore access (block 44b). Without ?token: the email form; the answer is the same whatever the email (the API
 * never says whether it belongs to a subscriber). With ?token (the emailed link): redeemed for PRO on this browser.
 */
function Restore() {
  const token = useSearchParams().get('token')
  const refresh = useAccessStore((s) => s.refresh)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [redeem, setRedeem] = useState<'idle' | 'checking' | 'done' | 'failed'>(token ? 'checking' : 'idle')

  useEffect(() => {
    if (!PAYMENTS_ENABLED || !token) return
    let live = true
    redeemRestore(token)
      .then(() => refresh())
      .then(() => { if (live) setRedeem('done') })
      .catch(() => { if (live) setRedeem('failed') })
    return () => { live = false }
  }, [token, refresh])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      setNote(await requestRestore(email.trim()))
    } catch {
      setNote('That could not be sent. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  let body: React.ReactNode
  if (!PAYMENTS_ENABLED) {
    body = <p>Subscriptions open soon. Access today is by a code, in Settings.</p>
  } else if (token) {
    body = (
      <>
        <p role="status" aria-live="polite">
          {redeem === 'checking' && 'Checking the link…'}
          {redeem === 'done' && 'PRO is active again on this browser.'}
          {redeem === 'failed' && 'This link is not valid any more. Links work for 15 minutes: ask for a new one below.'}
        </p>
        {redeem === 'done' && <Link href={RACE_LIST_HREF} className={buttonClass('ink', true)}>Open the races</Link>}
        {redeem === 'failed' && <Link href="/billing/restore" className={buttonClass('default', true)}>Ask for a new link</Link>}
      </>
    )
  } else {
    body = (
      <form onSubmit={send} style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
        <p className={ui.sub} style={{ margin: 0 }}>Enter the email you paid with. If a subscription is active for it, a link arrives there; it works for 15 minutes.</p>
        <label htmlFor="restore-email">Email</label>
        <input id="restore-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <div><button type="submit" className={buttonClass('primary', true)} disabled={busy || !email.trim()}>{busy ? 'Sending…' : 'Send the link'}</button></div>
        <p role="status" aria-live="polite" style={{ margin: 0 }}>{note ?? ''}</p>
      </form>
    )
  }

  return (
    <AppShell breadcrumb={[{ label: 'Restore access' }]}>
      <PageContainer width="reading">
        <PageHeader kicker="Subscription" title="Restore access" />
        <div className={pg.page}>{body}</div>
      </PageContainer>
    </AppShell>
  )
}

export default function RestorePage() {
  return <Suspense><Restore /></Suspense>
}
