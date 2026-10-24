'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { pingApi } from '@/lib/api'
import { sweepTarget } from '@/lib/sweep'

/**
 * Warming a race before the click (block 48): when the pointer rests on, the
 * keyboard focuses, or a finger touches something that opens /race/<k>, Next
 * prefetches that route and the API is asked once whether it is up (/health),
 * so a sleeping server starts waking while the reader decides.
 *
 * Capped: each route is prefetched once, at most MAX_PREFETCH per tab; /health
 * is asked once per browser session (sessionStorage), whatever happens after.
 */
export const MAX_PREFETCH = 12
const HEALTH_KEY = 'pw_api_warmed'

const prefetched = new Set<string>()
let healthAsked = false

function askHealthOnce() {
  if (healthAsked) return
  healthAsked = true
  try {
    if (sessionStorage.getItem(HEALTH_KEY)) return
    sessionStorage.setItem(HEALTH_KEY, '1')
  } catch { /* private mode: the in-memory flag still caps it per tab */ }
  void pingApi(4000)
}

export function warmRace(href: string, prefetch: (href: string) => void) {
  const path = href.split(/[?#]/)[0]
  if (sweepTarget(path) !== 'race') return
  if (!prefetched.has(path) && prefetched.size < MAX_PREFETCH) {
    prefetched.add(path)
    prefetch(path)
  }
  askHealthOnce()
}

/** Handlers for whatever opens a race: pointer over, focus, touch. One hook, any number of links. */
export function useWarmRace() {
  const router = useRouter()
  return useMemo(() => (href: string) => {
    const warm = () => warmRace(href, (h) => router.prefetch(h))
    return { onPointerEnter: warm, onFocus: warm, onTouchStart: warm }
  }, [router])
}

export function __resetWarmForTests() {
  prefetched.clear()
  healthAsked = false
  try { sessionStorage.removeItem(HEALTH_KEY) } catch { /* none */ }
}
