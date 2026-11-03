'use client'

import { create } from 'zustand'
import { fetchPromo } from '@/lib/api'
import { RETRIES, RETRY_MS } from '@/lib/openAccess'

/**
 * The public promo code, mirrored from GET /access/promo (the API's PRO_PROMO_CODES). Read at run time, never a
 * NEXT_PUBLIC variable, so the code is not in the repo or the build, and starting, extending or ending a promo is
 * a change on Render alone. It ends by itself at `until` (a timer). A sleeping API is asked again as for the open
 * week (lib/openAccess.ts). No answer reads as no promo: the banner then never shows.
 */
type PromoState = { active: boolean; code: string | null; until: string | null; days: number | null }
const NONE: PromoState = { active: false, code: null, until: null, days: null }
export const usePromo = create<PromoState>(() => NONE)

let endTimer: ReturnType<typeof setTimeout> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let inFlight: Promise<void> | null = null

function apply(next: PromoState) {
  if (endTimer) { clearTimeout(endTimer); endTimer = null }
  const end = next.until ? Date.parse(next.until) : NaN
  const running = next.active && Number.isFinite(end) && Date.now() < end
  usePromo.setState(running ? next : NONE)
  if (running) endTimer = setTimeout(() => usePromo.setState(NONE), Math.min(end - Date.now(), 2 ** 31 - 1))
}

export function loadPromo(attempt = 0): Promise<void> {
  if (!inFlight) {
    inFlight = fetchPromo().then((r) => {
      apply({ active: r.active, code: r.code, until: r.until, days: r.days })
      if (!r.answered && attempt < RETRIES) {
        if (retryTimer) clearTimeout(retryTimer)
        retryTimer = setTimeout(() => { retryTimer = null; void loadPromo(attempt + 1) }, RETRY_MS)
      }
    }).finally(() => { inFlight = null })
  }
  return inFlight
}

export type Lang = 'en' | 'es'

/** Spanish for a browser that asks for it first, English otherwise. The site has no locale routes. */
export function promoLanguage(): Lang {
  try {
    return (navigator.language || '').toLowerCase().startsWith('es') ? 'es' : 'en'
  } catch {
    return 'en'
  }
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** Whole days left, rounded down ("7 days remaining" while 7 or more full days are left), then hours within the
 *  last 24 hours, rounded up so it never reads 0h while the promo runs. */
export function remainingText(until: string, now: number, lang: Lang): string {
  const left = Math.max(0, Date.parse(until) - now)
  if (left > DAY) {
    const n = Math.floor(left / DAY)
    if (n === 1) return lang === 'es' ? 'Queda 1 día' : '1 day remaining'
    return lang === 'es' ? `Quedan ${n} días` : `${n} days remaining`
  }
  const h = Math.max(1, Math.ceil(left / HOUR))
  return lang === 'es' ? `Quedan ${h} h` : `${h}h remaining`
}

export function __resetPromoForTests() {
  if (endTimer) clearTimeout(endTimer)
  if (retryTimer) clearTimeout(retryTimer)
  endTimer = retryTimer = null
  inFlight = null
  usePromo.setState(NONE)
}
