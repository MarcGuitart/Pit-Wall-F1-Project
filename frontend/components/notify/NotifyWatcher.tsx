'use client'

import { useEffect } from 'react'
import { fetchAnalysis } from '@/lib/api'
import { fetchLiveServerStatus } from '@/lib/liveStatus'
import { fire, getWatches, removeWatch } from '@/lib/notify'

const CHECK_MS = 60_000

/**
 * Checks this browser's watches while any tab of the site is open: a live
 * watch fires when the live server reports a session; an analysis watch fires
 * once its unlock time has passed and /analysis actually answers.
 * Mounted once, in the root layout.
 */
export function NotifyWatcher() {
  useEffect(() => {
    let busy = false
    async function check() {
      if (busy || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
      const watches = getWatches()
      if (!watches.length) return
      busy = true
      try {
        if (watches.some(w => w.kind === 'live')) {
          const { reachable, sessionKey } = await fetchLiveServerStatus()
          if (reachable && sessionKey != null) {
            for (const w of watches.filter(x => x.kind === 'live')) {
              removeWatch(w.id)
              fire('Live now — Pit Wall Engineer', `${w.label} has started. Open the pit wall.`, `/live/${sessionKey}`)
            }
          }
        }
        for (const w of watches) {
          if (w.kind !== 'analysis') continue
          if (w.readyAt && Date.now() < new Date(w.readyAt).getTime()) continue
          try {
            await fetchAnalysis(w.sessionKey)
            removeWatch(w.id)
            fire('Analysis ready — Pit Wall Engineer', `${w.label} is ready to read.`, `/race/${w.sessionKey}`)
          } catch { /* still in the live window — next check */ }
        }
      } finally {
        busy = false
      }
    }
    void check()
    const id = setInterval(check, CHECK_MS)
    return () => clearInterval(id)
  }, [])
  return null
}
