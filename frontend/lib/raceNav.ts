'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { create } from 'zustand'
import { loadStartedAt } from '@/lib/loadPhase'

/**
 * A click on a race, before the route has arrived.
 *
 * /race/[sessionKey] is a dynamic route: on a client navigation Next waits
 * for the server's answer (on Netlify, a serverless function that may be
 * cold) before it renders anything — even the route's loading.tsx, unless it
 * was prefetched. Measured: three seconds of the old page with no sign the
 * click did anything. So the click itself records the pending race, and the
 * shell shows the analysis loader at once (with its 300 ms grace) until the
 * route replaces it. The load clock starts at the click, so the page's own
 * loader continues the same wait rather than starting another.
 */
type Pending = { href: string; key: number } | null

export const usePendingRace = create<{ pending: Pending; set: (p: Pending) => void }>((set) => ({
  pending: null,
  set: (pending) => set({ pending }),
}))

export function useOpenRace(basePath = '/race') {
  const router = useRouter()
  return useCallback((key: number) => {
    const href = `${basePath}/${key}`
    loadStartedAt(key)
    usePendingRace.getState().set({ href, key })
    router.push(href)
  }, [router, basePath])
}
