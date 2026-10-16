'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAccessStore } from '@/stores/accessStore'
import { useLiveStatus } from '@/hooks/useLiveStatus'
import { NotifyButton } from '@/components/notify/NotifyButton'
import { RadioTrigger } from '@/components/radio/RadioTrigger'
import { proSeasons } from '@/lib/access'
import { formatLocalDateTime } from '@/lib/format'
import s from './shell.module.css'

type BreadcrumbItem = {
  label: string
  href?: string
}

type TopBarProps = {
  breadcrumb?: BreadcrumbItem[]
}

/**
 * The site's top bar, in the live page's design (the /preview nav promoted).
 * Same contents as before: brand, PRO indicator, breadcrumb, the Historical /
 * Live mode pair, Docs and the race engineer.
 */
export function TopBar({ breadcrumb }: TopBarProps) {
  // Both halves required: an active token AND the display preference (Settings'
  // toggle) still set to show it. A token past its expiry, or hidden by choice,
  // shows nothing here rather than a stale or unwanted badge.
  const showProBadge = useAccessStore((st) => st.pro && st.showBadge)
  const pro = useAccessStore((st) => st.pro)
  const currentSeasonYear = proSeasons()[0]
  const { liveSessionKey, liveChecked, nextLive } = useLiveStatus(pro, currentSeasonYear)
  const [showLiveTip, setShowLiveTip] = useState(false)

  return (
    <header className={s.bar}>
      <Link href="/" className={s.brand}>PIT WALL<span>ENGINEER</span></Link>

      {/* PRO indicator — only when active, never a permanent "Free" that adds
          noise. Clicks through to Settings, where the toggle and the code
          field actually live now. */}
      {showProBadge && (
        <Link href="/settings" className={s.proActive} aria-label="PRO access active — open Settings">PRO</Link>
      )}

      {breadcrumb && breadcrumb.length > 0 && (
        <nav className={s.crumbs} aria-label="Breadcrumb">
          <ol>
            {breadcrumb.map((item, i) => (
              <li key={i}>
                {item.href
                  ? <Link href={item.href}>{item.label}</Link>
                  : <span aria-current={i === breadcrumb.length - 1 ? 'page' : undefined}>{item.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className={s.right}>
        {/* Historical — always the mode of these pages */}
        <span className={`${s.navLink} ${s.navOn}`} aria-current="page">Historical</span>

        {/* Live — a real link once a session is live (verified against the live
            server, never the clock alone), the real next session when PRO but
            nothing is live, or an invitation to Settings without PRO. Status
            shared with the landing page's Live bay via useLiveStatus. */}
        <div
          className={s.tipWrap}
          onMouseEnter={() => pro && liveSessionKey === null && setShowLiveTip(true)}
          onMouseLeave={() => setShowLiveTip(false)}
        >
          {pro && liveSessionKey !== null ? (
            <Link href={`/live/${liveSessionKey}`} className={`${s.navLink} ${s.liveOn}`}>
              <span className={s.liveDot} aria-hidden="true" />
              Live
            </Link>
          ) : pro ? (
            <span
              onMouseEnter={() => setShowLiveTip(true)}
              onMouseLeave={() => setShowLiveTip(false)}
              onFocus={() => setShowLiveTip(true)}
              onBlur={() => setShowLiveTip(false)}
              tabIndex={0}
              className={s.navLink}
              aria-label="Live mode — no session live right now"
            >
              Live
            </span>
          ) : (
            <Link
              href="/settings"
              onMouseEnter={() => setShowLiveTip(true)}
              onMouseLeave={() => setShowLiveTip(false)}
              onFocus={() => setShowLiveTip(true)}
              onBlur={() => setShowLiveTip(false)}
              className={`${s.navLink} ${s.navOff}`}
              aria-label="Live mode — PRO, open Settings"
            >
              Live<span className={s.pro}>PRO</span>
            </Link>
          )}
          {showLiveTip && (
            <div className={s.tip} style={pro ? undefined : { pointerEvents: 'none' }}>
              {pro ? (
                <>
                  <div className={s.tipTitle}>No live session right now</div>
                  <div className={s.tipBody}>
                    {liveChecked && nextLive ? (
                      <>Next live session: {nextLive.meetingName} {nextLive.sessionName}, {formatLocalDateTime(nextLive.dateStart)}</>
                    ) : liveChecked ? (
                      <>No upcoming session is scheduled.</>
                    ) : (
                      <>Checking…</>
                    )}
                  </div>
                  {liveChecked && nextLive && (
                    <div className={s.tipFoot}>
                      <NotifyButton
                        watch={{ kind: 'live', id: `live-${nextLive.dateStart}`, label: `${nextLive.meetingName} ${nextLive.sessionName}`, startsAt: nextLive.dateStart }}
                        className={s.navLink}
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className={s.tipTitle} style={{ color: 'var(--pw-accent-text)' }}>Live mode · PRO</div>
                  <div className={s.tipBody}>
                    Follow the race as it happens, live. Part of PRO — enter an access code in Settings to unlock it.
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <Link href="/docs" className={s.navLink}>Docs</Link>

        <RadioTrigger />
      </div>
    </header>
  )
}
