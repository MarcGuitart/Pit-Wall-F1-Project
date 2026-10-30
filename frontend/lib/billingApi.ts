import { apiFetch } from '@/lib/api'
import { announceAccessChange, storeToken } from '@/lib/access'

/*
 * The billing endpoints (block 44), apart from lib/api.ts since block 52b:
 * only the billing components and pages import them, so no shared bundle
 * carries them while payments are off.
 */
/** PRO by subscription (block 44). Every call answers 503 while payments are off. */
type BillingToken = { token: string; expires_at: number; expires_in: number; free_seasons: number[]; telegram_invite?: string | null }

/** A Stripe Checkout url for the monthly PRO price. */
export async function startCheckout(): Promise<string> {
  return (await apiFetch<{ url: string }>('/billing/checkout', { method: 'POST' })).url
}

/** After Checkout: the backend checks the session with Stripe and answers the PRO token. */
export async function completeCheckout(sessionId: string): Promise<{ telegramInvite: string | null }> {
  const body = await apiFetch<BillingToken>(`/billing/success?session_id=${encodeURIComponent(sessionId)}`)
  storeToken(body.token, body.expires_at)
  announceAccessChange()
  return { telegramInvite: body.telegram_invite ?? null }
}

/** Restore (block 44b): the API answers the same whatever the email; the link arrives by email if it can. */
export async function requestRestore(email: string): Promise<string> {
  return (await apiFetch<{ sent: boolean; message: string }>('/billing/restore', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
  })).message
}

/** The emailed link's token, for a PRO token on this browser. */
export async function redeemRestore(token: string): Promise<void> {
  const body = await apiFetch<BillingToken>('/billing/restore/redeem', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
  })
  storeToken(body.token, body.expires_at)
  announceAccessChange()
}

/** A fresh token while the subscription is still paid; throws when it is not. */
export async function renewSubscription(): Promise<void> {
  const body = await apiFetch<BillingToken>('/billing/renew', { method: 'POST' })
  storeToken(body.token, body.expires_at)
  announceAccessChange()
}

/** A Stripe Customer Portal url (cancel, card, invoices). */
export async function billingPortalUrl(): Promise<string> {
  return (await apiFetch<{ url: string }>('/billing/portal', { method: 'POST' })).url
}
