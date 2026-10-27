'use client'

import { useEffect, useState } from 'react'
import { LIVE_TAIL_MS, fetchNextLiveSession, scheduledEnd, type NextLiveSessionInfo } from '@/lib/liveStatus'
import { currentSeason } from '@/lib/seasons'
import { shared, useIsland } from '@/lib/island'
import { AddToCalendarButton } from '@/components/ui/AddToCalendarButton'
import h from './home.module.css'

/**
 * One calendar request for the landing, keeping a session through its live tail (90 min after its scheduled end,
 * block 51): the live card needs it to ask /live/state while a session overruns, as the top bar does.
 */
let calendarWithTail: Promise<NextLiveSessionInfo | null> | null = null
export function loadCalendarWithTail(): Promise<NextLiveSessionInfo | null> {
  if (!calendarWithTail) {
    calendarWithTail = fetchNextLiveSession(currentSeason(), new Date(), LIVE_TAIL_MS)
      .catch((e) => { calendarWithTail = null; throw e })
  }
  return calendarWithTail
}

/** The next session for the hero card: that same answer, unless it is a session already past its scheduled end, in
 *  which case the one after it (a second lookup, only during a tail). */
export const loadNextSession = () => shared(async () => {
  const n = await loadCalendarWithTail()
  if (n && Date.now() > scheduledEnd(n)) return fetchNextLiveSession(currentSeason(), new Date(), 0, new Set([n.sessionKey]))
  return n
})

export function __resetLandingCalendarForTests() { calendarWithTail = null }

/** "now", on the client only: the static HTML and the first render carry no time, so hydration agrees. */
export function useClientNow(tickMs: number): number | null {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), tickMs)
    return () => clearInterval(id)
  }, [tickMs])
  return now
}

function parts(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60_000))
  return { d: Math.floor(m / 1440), h: Math.floor((m % 1440) / 60), m: m % 60 }
}

export function sessionIcs(next: NextLiveSessionInfo) {
  return {
    uid: `pitwall-${next.sessionKey}@pitwallengineer.com`,
    summary: `Pit Wall · ${next.place} ${next.sessionName}`,
    description: 'Live mode on Pit Wall Engineer follows the session while it runs.',
    location: next.place,
    dateStart: next.dateStart,
    dateEnd: next.dateEnd as string,
  }
}

/** Hero aside: the next session of any type, from the calendar (Block 19's lookup). */
export function NextSessionCard() {
  const island = useIsland(loadNextSession)
  const now = useClientNow(30_000)

  let body
  if (island.status === 'loading') {
    body = (
      <>
        <span className={h.bar} style={{ height: 40, width: '70%' }} aria-hidden="true" />
        <span className={h.bar} style={{ width: '55%' }} aria-hidden="true" />
      </>
    )
  } else if (island.status === 'unavailable') {
    body = <p className={h.unavailable}>The calendar is unavailable right now.</p>
  } else if (!island.data) {
    body = <p className={h.unavailable}>No session is scheduled.</p>
  } else {
    const next = island.data
    const start = new Date(next.dateStart)
    const left = now != null ? parts(start.getTime() - now) : null
    body = (
      <>
        <p className={h.nextPlace}>{next.place}</p>
        <div className={h.nextWhen}>
          {next.sessionName} · {start.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })} local
        </div>
        <div className={h.countdown} role="timer" aria-label={left ? `Starts in ${left.d} days, ${left.h} hours, ${left.m} minutes` : 'Starts in'}>
          {(['d', 'h', 'm'] as const).map((k) => (
            <div key={k}>
              <span className={h.cdValue}>{left ? String(left[k]).padStart(2, '0') : 'n/a'}</span>
              <span className={h.cdUnit}>{k === 'd' ? 'Days' : k === 'h' ? 'Hours' : 'Minutes'}</span>
            </div>
          ))}
        </div>
        <span />
        {next.dateEnd ? <AddToCalendarButton variant="system" event={sessionIcs(next)} /> : <span />}
      </>
    )
  }

  return (
    <aside className={h.nextCard} aria-labelledby="next-title" data-island="next" data-state={island.status}>
      <div className={h.cardLabel} id="next-title">Next session</div>
      {body}
    </aside>
  )
}
