'use client'

/**
 * Whether a live session is running right now, and if not, when the next one
 * is — for a PRO visitor. Extracted from ProSection (Block 19) so TopBar
 * (Block 22) can show the same real status instead of a second, disconnected
 * "coming soon" that never agreed with it.
 *
 * Checked against the live server itself (lib/liveStatus.ts's
 * fetchLiveServerStatus), never the clock alone — a session can start late,
 * and the live server is the only thing that actually knows whether data is
 * arriving. Only polled while `pro` is true: a non-PRO visitor gets no
 * live-status network calls at all.
 */
import { useEffect, useState } from 'react'
import { fetchLiveServerStatus, fetchNextLiveSession, type NextLiveSessionInfo } from '@/lib/liveStatus'

const POLL_MS = 60_000

export type LiveStatus = {
  /** The session the live server is following, or null if none. */
  liveSessionKey: number | null
  /** Whether at least one check has completed — distinguishes "still finding
   *  out" from "checked, and there is genuinely nothing live". */
  liveChecked: boolean
  /** Set only once liveSessionKey is confirmed null — the next scheduled
   *  session of any type, from the real calendar. */
  nextLive: NextLiveSessionInfo | null
}

export function useLiveStatus(pro: boolean, currentSeasonYear: number | undefined): LiveStatus {
  const [liveSessionKey, setLiveSessionKey] = useState<number | null>(null)
  const [liveChecked, setLiveChecked] = useState(false)
  const [nextLive, setNextLive] = useState<NextLiveSessionInfo | null>(null)

  useEffect(() => {
    if (!pro || currentSeasonYear === undefined) {
      setLiveSessionKey(null)
      setLiveChecked(false)
      return
    }
    let cancelled = false

    async function poll() {
      const status = await fetchLiveServerStatus()
      if (cancelled) return
      setLiveSessionKey(status.sessionKey)
      if (status.sessionKey === null) {
        const next = await fetchNextLiveSession(currentSeasonYear as number)
        if (!cancelled) setNextLive(next)
      }
      if (!cancelled) setLiveChecked(true)
    }

    poll()
    const id = setInterval(poll, POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [pro, currentSeasonYear])

  return { liveSessionKey, liveChecked, nextLive }
}
