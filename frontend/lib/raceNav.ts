'use client'

import { useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { create } from 'zustand'
import { loadStartedAt } from '@/lib/loadPhase'
import { clickedAt, prefersReducedMotion, shouldSweep, useSweep, type ClickLike } from '@/lib/sweep'

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

/**
 * Navigate, with the diagonal sweep when this is a plain click to a race or
 * live mode (block 34, lib/sweep.ts); otherwise a plain router.push. `label`
 * is the destination as the bands show it ("Baku · Race").
 */
export function useNavigateWithSweep() {
  const router = useRouter()
  const pathname = usePathname()
  return useCallback((href: string, label: string, click?: ClickLike | null) => {
    if (shouldSweep(href, pathname ?? '', click, prefersReducedMotion())) useSweep.getState().start(href, label, clickedAt(click))
    router.push(href)
  }, [router, pathname])
}

export type OpenRaceOptions = { label?: string; click?: ClickLike | null }

export function useOpenRace(basePath = '/race') {
  const navigate = useNavigateWithSweep()
  return useCallback((key: number, opts: OpenRaceOptions = {}) => {
    const href = `${basePath}/${key}`
    loadStartedAt(key)
    usePendingRace.getState().set({ href, key })
    navigate(href, opts.label ?? 'Race analysis', opts.click)
  }, [navigate, basePath])
}
