'use client'

import { useEffect, useState } from 'react'
import { billingPortalUrl } from '@/lib/api'
import { PAYMENTS_ENABLED, isSubscriptionToken } from '@/lib/payments'

/**
 * Settings: open Stripe's Customer Portal (cancel, card, invoices) for access
 * bought by subscription. Nothing for code access or with payments off.
 */
export function ManageSubscription({ className }: { className?: string }) {
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // localStorage is read after mount, so server and client render the same.
  useEffect(() => { setSubscribed(PAYMENTS_ENABLED && isSubscriptionToken()) }, [])
  if (!subscribed) return null

  async function open() {
    setBusy(true)
    setError(null)
    try {
      window.location.assign(await billingPortalUrl())
    } catch {
      setError('Could not open the subscription page. Try again in a moment.')
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <button type="button" onClick={open} disabled={busy} className={className}>
        {busy ? 'Opening…' : 'Manage subscription'}
      </button>
      <p role="status" aria-live="polite" style={{ margin: 0, fontSize: 13 }}>{error ?? ''}</p>
    </div>
  )
}
