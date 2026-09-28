'use client'

/**
 * Mounted once, in the root layout — not per page. Initialises the shared PRO
 * store on first load and keeps it in sync with redeem/sign-out events fired
 * anywhere in the app (lib/access.ts's ACCESS_CHANGED_EVENT).
 *
 * Renders nothing. This is the one place that owns the store's lifecycle so
 * TopBar and the Settings page can both just read it.
 */
import { useEffect } from 'react'
import { useAccessStore, ACCESS_CHANGED_EVENT } from '@/stores/accessStore'

export function AccessBootstrap() {
  const refresh = useAccessStore((s) => s.refresh)

  useEffect(() => {
    refresh()
    window.addEventListener(ACCESS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(ACCESS_CHANGED_EVENT, refresh)
  }, [refresh])

  return null
}
