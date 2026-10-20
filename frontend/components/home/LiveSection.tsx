'use client'

import Link from 'next/link'
import { fetchLivePublicState } from '@/lib/liveStatus'
import { useIsland } from '@/lib/island'
import { AddToCalendarButton } from '@/components/ui/AddToCalendarButton'
import { NotifyButton } from '@/components/notify/NotifyButton'
import { buttonClass } from '@/components/ui'
import { loadNextSession, sessionIcs, useClientNow } from './NextSessionCard'
import h from './home.module.css'

const HOUR = 3_600_000

function hms(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':')
}

/**
 * One card with the real state — no session, under an hour, live — from the
 * live server's public /live/state and the calendar. Never a time, position or
 * driver. If /live/state is missing or slow the card says so, at the same
 * height, with no live content: collapsing it would move everything below it
 * (Block 29 addendum: nothing moves more than 2 px when an island fails).
 */
function LiveCard() {
  const live = useIsland(() => fetchLivePublicState())
  const next = useIsland(loadNextSession)
  const now = useClientNow(1000)

  const upcoming = next.status === 'ok' ? next.data : null
  const startsIn = upcoming && now != null ? new Date(upcoming.dateStart).getTime() - now : null
  const state = live.status === 'ok' && live.data.state === 'live' ? 'live'
    : startsIn != null && startsIn > 0 && startsIn <= HOUR ? 'soon' : 'none'

  let body
  if (live.status === 'unavailable') {
    body = (
      <>
        <div className={h.livePill}><span className={h.liveDot} aria-hidden="true" />Live status</div>
        <p className={h.unavailable}>Live status is unavailable right now.</p>
      </>
    )
  } else if (live.status === 'loading') {
    body = <span className={h.bar} style={{ height: 32, width: '60%' }} aria-hidden="true" />
  } else if (state === 'live' && live.status === 'ok') {
    body = (
      <>
        <div className={h.livePill}><span className={`${h.liveDot} ${h.liveDotOn}`} aria-hidden="true" />Live now</div>
        <h3 className={h.liveTitle}>A session is on track</h3>
        <span />
        <span />
        <div><Link href={`/live/${live.data.sessionKey}`} className={buttonClass('primary', true)}>Open live mode</Link></div>
      </>
    )
  } else if (state === 'soon' && upcoming) {
    body = (
      <>
        <div className={h.livePill}><span className={`${h.liveDot} ${h.liveDotSoon}`} aria-hidden="true" />Starts in under 1 hour</div>
        <div className={h.liveBig} role="timer">{hms(startsIn ?? 0)}</div>
        <div className={h.nextWhen}>{upcoming.place} · {upcoming.sessionName}</div>
        <span />
        <div className={h.ctas}>
          <Link href={`/live/${upcoming.sessionKey}`} className={buttonClass('primary', true)}>Open live mode</Link>
          {upcoming.dateEnd && <AddToCalendarButton variant="system" event={sessionIcs(upcoming)} />}
        </div>
      </>
    )
  } else {
    const when = upcoming ? new Date(upcoming.dateStart) : null
    body = (
      <>
        <div className={h.livePill}><span className={h.liveDot} aria-hidden="true" />Stream idle</div>
        <h3 className={h.liveTitle}>No live session</h3>
        <div className={h.nextWhen}>
          {upcoming && when
            ? <>Next: {upcoming.place} · {upcoming.sessionName} — {when.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} local</>
            : 'No upcoming session is scheduled.'}
        </div>
        <span />
        {upcoming && (
          <div className={h.ctas}>
            {upcoming.dateEnd && <AddToCalendarButton variant="system" event={sessionIcs(upcoming)} />}
            <NotifyButton
              watch={{ kind: 'live', id: `live-${upcoming.dateStart}`, label: `${upcoming.place} ${upcoming.sessionName}`, startsAt: upcoming.dateStart }}
              className={buttonClass('ink')}
            />
          </div>
        )}
      </>
    )
  }

  return (
    <div className={h.liveCard} data-island="live" data-state={live.status === 'ok' ? state : live.status}>
      {body}
    </div>
  )
}

export function LiveSection() {
  return (
    <section id="live" className={`${h.section} ${h.anchored}`} aria-labelledby="live-title">
      <div className={h.secHead}>
        <span className={h.secNum}>02 · Live mode</span>
        <h2 id="live-title" className={h.secTitle}>Follow a session as it happens</h2>
        <p className={h.secLead}>
          Live mode is part of PRO. Browser notifications only work while a Pit Wall Engineer tab is open; if you
          close the tab, nothing is sent.
        </p>
      </div>
      <div style={{ padding: '0 var(--pw-gutter) 32px' }}>
        <LiveCard />
      </div>
    </section>
  )
}
