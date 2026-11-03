'use client'

/**
 * Mounted once, in the root layout — not per page. Initialises the shared PRO
 * store on first load and keeps it in sync with redeem/sign-out events fired
 * anywhere in the app (lib/access.ts's ACCESS_CHANGED_EVENT).
 *
 * Also loads the open week's state (lib/openAccess.ts) and the public promo code (lib/promo.ts) from the API.
 *
 * Renders nothing. This is the one place that owns the store's lifecycle so
 * TopBar and the Settings page can both just read it.
 */
import { useEffect } from 'react'
import { useAccessStore, ACCESS_CHANGED_EVENT } from '@/stores/accessStore'
import { loadOpenAccess, refreshOpenAccessIfStale } from '@/lib/openAccess'
import { loadPromo } from '@/lib/promo'

export function AccessBootstrap() {
  const refresh = useAccessStore((s) => s.refresh)

  useEffect(() => {
    refresh()
    window.addEventListener(ACCESS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(ACCESS_CHANGED_EVENT, refresh)
  }, [refresh])

  // The open week (block 50): asked once on load, again when a tab comes back after a while.
  useEffect(() => {
    void loadOpenAccess()
    void loadPromo()
    const onVisible = () => { if (document.visibilityState === 'visible') refreshOpenAccessIfStale() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  return null
}
