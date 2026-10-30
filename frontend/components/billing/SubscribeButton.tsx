'use client'

import { useState } from 'react'
import { startCheckout } from '@/lib/billingApi'
import { PRO_PRICE, PRO_PRICE_PERIOD } from '@/lib/access'
import { PAYMENTS_ENABLED } from '@/lib/payments'
import { buttonClass, ui } from '@/components/ui'

/**
 * Subscribe to PRO through Stripe Checkout (block 44). Renders nothing while
 * payments are off, so callers keep their "not open yet" line instead.
 */
export function SubscribeButton({ id = 'subscribe', large = true }: { id?: string; large?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!PAYMENTS_ENABLED) return null

  async function go() {
    setBusy(true)
    setError(null)
    try {
      window.location.assign(await startCheckout())
    } catch {
      setError('Could not open the checkout. Try again in a moment.')
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div>
        <button type="button" id={id} className={buttonClass('primary', large)} disabled={busy} aria-describedby={`${id}-note`} onClick={go}>
          {busy ? 'Opening checkout…' : `Subscribe, ${PRO_PRICE} a ${PRO_PRICE_PERIOD}`}
        </button>
      </div>
      <p id={`${id}-note`} className={ui.sub} style={{ margin: 0 }}>Paid through Stripe. Cancel any time from Settings.</p>
      <p role="status" aria-live="polite" className={error ? ui.accent : ui.srOnly} style={{ margin: 0, fontSize: 13 }}>{error ?? ''}</p>
    </div>
  )
}
