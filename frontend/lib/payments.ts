import { getToken, tokenExpiry } from '@/lib/access'
import { renewSubscription } from '@/lib/billingApi'

import { PAYMENTS_ENABLED } from '@/lib/paymentsFlag'

/** The flag (lib/paymentsFlag.ts), re-exported for the billing pages and components. */
export { PAYMENTS_ENABLED }

/** Renew this many days before the stored token runs out. */
export const RENEW_WITHIN_DAYS = 5

/** Whether the stored token was bought with a subscription (code id "stripe:..."). */
export function isSubscriptionToken(token: string | null = getToken()): boolean {
  if (!token) return false
  const payload = token.split('.')[1]
  if (!payload) return false
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const cid = (JSON.parse(json) as { cid?: unknown }).cid
    return typeof cid === 'string' && cid.startsWith('stripe:')
  } catch {
    return false
  }
}

/**
 * Renew a subscription token that is close to running out. Quiet on failure:
 * a cancelled subscription simply lets the token expire.
 */
export async function renewIfDue(now: number = Date.now()): Promise<boolean> {
  if (!PAYMENTS_ENABLED || !isSubscriptionToken()) return false
  const expiry = tokenExpiry()
  if (!expiry || expiry.getTime() - now > RENEW_WITHIN_DAYS * 86400_000) return false
  try {
    await renewSubscription()
    return true
  } catch {
    return false
  }
}
