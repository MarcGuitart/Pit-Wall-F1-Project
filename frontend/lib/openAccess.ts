'use client'

import { create } from 'zustand'
import { fetchOpenAccess } from '@/lib/api'
import { useAccessStore } from '@/stores/accessStore'

/**
 * The open week (block 50). The API's OPEN_ACCESS_UNTIL decides; this mirrors it for the interface, read at run
 * time from GET /access/open (never a NEXT_PUBLIC variable), so extending or closing the week needs no Netlify
 * deploy. While open: no PRO walls in the interface, and the top bar says until when. It closes by itself at
 * `until` (a timer), and is asked again when the tab comes back after REFRESH_MS, so a week closed early or
 * extended on Render reaches open tabs too. No answer reads as closed: the interface is then exactly as before.
 */
export const REFRESH_MS = 10 * 60_000
/** A free Render API sleeps and takes about a minute to wake (block 51): no answer is asked again every RETRY_MS,
 *  RETRIES times (90 s in all), so a visitor arriving at a sleeping API still sees the week once it answers. */
export const RETRY_MS = 20_000
export const RETRIES = 4

type OpenState = { open: boolean; until: string | null; checkedAt: number }
export const useOpenAccess = create<OpenState>(() => ({ open: false, until: null, checkedAt: 0 }))

let closeTimer: ReturnType<typeof setTimeout> | null = null
let inFlight: Promise<void> | null = null

function apply(open: boolean, until: string | null) {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null }
  const end = until ? Date.parse(until) : NaN
  const stillOpen = open && Number.isFinite(end) && Date.now() < end
  useOpenAccess.setState({ open: stillOpen, until, checkedAt: Date.now() })
  if (stillOpen) {
    // setTimeout caps near 24.8 days; a longer week is re-armed by the periodic refresh.
    closeTimer = setTimeout(() => useOpenAccess.setState({ open: false }), Math.min(end - Date.now(), 2 ** 31 - 1))
  }
}

let retryTimer: ReturnType<typeof setTimeout> | null = null

export function loadOpenAccess(attempt = 0): Promise<void> {
  if (!inFlight) {
    inFlight = fetchOpenAccess().then((r) => {
      apply(r.open, r.until)
      if (!r.answered && attempt < RETRIES) {
        if (retryTimer) clearTimeout(retryTimer)
        retryTimer = setTimeout(() => { retryTimer = null; void loadOpenAccess(attempt + 1) }, RETRY_MS)
      }
    }).finally(() => { inFlight = null })
  }
  return inFlight
}

/** On a tab coming back: ask again if the last answer is older than REFRESH_MS. */
export function refreshOpenAccessIfStale() {
  if (Date.now() - useOpenAccess.getState().checkedAt >= REFRESH_MS) void loadOpenAccess()
}

/** Access to every PRO feature in the interface: a token, or the open week. */
export function useHasAccess(): boolean {
  const pro = useAccessStore((s) => s.pro)
  const open = useOpenAccess((s) => s.open)
  return pro || open
}

/** "Tue 3 Nov, 10:00 CET": the instant in Spain's time, the zone named as the date has it (CET or CEST). */
export function formatUntil(until: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short',
  }).formatToParts(new Date(until)).map((p) => [p.type, p.value]))
  return `${parts.weekday} ${parts.day} ${parts.month}, ${parts.hour}:${parts.minute} ${parts.timeZoneName}`
}

export function __resetOpenAccessForTests() {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  if (closeTimer) clearTimeout(closeTimer)
  closeTimer = null
  inFlight = null
  useOpenAccess.setState({ open: false, until: null, checkedAt: 0 })
}
