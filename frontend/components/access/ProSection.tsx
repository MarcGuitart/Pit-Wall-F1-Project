'use client'

/**
 * The PRO section of the landing page — informational only.
 *
 * Block 20: the code field and the "access active" banner both moved to
 * /settings, which owns that whole exchange now. This section explains what
 * PRO brings (the bays reflect the real calendar, same as before) and points
 * at Settings for anyone who wants to act on it. It reads the shared access
 * store rather than fetching its own status — Settings and TopBar read the
 * same value, so there is exactly one place that decides "is PRO active".
 *
 * The UI still decides nothing about access itself. Every PRO request is
 * gated on the backend and refused there with PRO_REQUIRED; a locked bay here
 * is a courtesy, not a security boundary.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAccessStore } from '@/stores/accessStore'
import { useLiveStatus } from '@/hooks/useLiveStatus'
import { PRO_PRICE_LABEL, proSeasons } from '@/lib/access'
import { formatExpiry, formatLocalDateTime, formatUtcTime } from '@/lib/format'
import { fetchNextRaceCardInfo, type NextRaceCardInfo } from '@/lib/nextSession'
import { AddToCalendarButton } from '@/components/ui/AddToCalendarButton'
import { ui } from '@/components/ui'
import l from '@/components/landing/landing.module.css'

const PRO_FEATURES = [
  { label: 'Races from 2025', sub: 'every session, fully analysed' },
  { label: 'The current season', sub: 'on the site within hours of the flag' },
  { label: 'Live mode', sub: 'the race as it happens — in build' },
]

export function ProSection() {
  const pro = useAccessStore((s) => s.pro)
  const expiresAt = useAccessStore((s) => s.expiresAt)
  const seasons = proSeasons()
  const currentSeasonYear = seasons[0]

  // The current season's card: when the next (or currently running) Grand Prix
  // actually is, from real calendar data — never a guess at when the write-up
  // will be ready, which is what the hourly publication Action decides.
  const [nextRace, setNextRace] = useState<NextRaceCardInfo | null>(null)
  useEffect(() => {
    let cancelled = false
    if (currentSeasonYear === undefined) return
    fetchNextRaceCardInfo(currentSeasonYear).then((info) => {
      if (!cancelled) setNextRace(info)
    })
    return () => { cancelled = true }
  }, [currentSeasonYear])

  // Live status: shared with TopBar's Live pill (hooks/useLiveStatus.ts,
  // Block 22) so the two never disagree about whether a session is live.
  const { liveSessionKey, liveChecked, nextLive } = useLiveStatus(pro, currentSeasonYear)

  return (
    <section id="pro" className={l.pro} aria-labelledby="pro-heading">
      {/* Header strip — informational; the access state and the code field
          live in Settings now, not here. */}
      <div className={l.proHead}>
        <div>
          <h2 id="pro-heading" className={l.proTitle}>
            Pit Wall <span className={ui.accent}>PRO</span>
          </h2>
          <p className={l.lead}>
            {pro
              ? 'Every season is open on this browser. The pit wall is yours.'
              : 'The free seasons are 2023 and 2024. Everything newer sits behind the wall.'}
          </p>
        </div>

        <SettingsLink pro={pro} expiresAt={expiresAt} />
      </div>

      {/* The bays */}
      <div className={`${ui.cells} ${ui.ruled}`} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))' }}>
        {seasons.map((year, i) => (
          <SeasonBay
            key={year}
            year={year}
            unlocked={pro}
            current={i === 0}
            nextRace={i === 0 ? nextRace : null}
          />
        ))}
        <LiveBay unlocked={pro} live={pro && liveSessionKey !== null} checked={liveChecked} />
      </div>

      <div className={l.proBody}>
        {/* The current season's real calendar, not a placeholder */}
        {nextRace && (
          <div className={l.proLine}>
            <p>
              {nextRace.status === 'processing' ? (
                <>
                  <b>{nextRace.meetingName}</b> has finished —
                  analysis processing. It publishes automatically once the data settles; no fixed time.
                </>
              ) : (
                <>
                  Next: <b>{nextRace.meetingName}</b>
                  {nextRace.circuitShortName ? ` (${nextRace.circuitShortName})` : ''} — runs from{' '}
                  <b>{formatLocalDateTime(nextRace.dateStart)}</b>
                  {nextRace.dateEnd && <> · race ends {formatUtcTime(nextRace.dateEnd)}</>}
                </>
              )}
            </p>
            {nextRace.status === 'upcoming' && nextRace.dateEnd && (
              <AddToCalendarButton
                variant="system"
                event={{
                  uid: `pitwall-next-${currentSeasonYear}-race@pitwallengineer.com`,
                  summary: `Pit Wall — ${nextRace.meetingName} Race`,
                  description: 'Full strategy analysis on pitwallengineer.com once published.',
                  location: [nextRace.circuitShortName, nextRace.countryName].filter(Boolean).join(', '),
                  dateStart: nextRace.dateStart,
                  dateEnd: nextRace.dateEnd,
                }}
              />
            )}
          </div>
        )}

        {/* Live: a real link once data is arriving, never a guess from the clock */}
        {pro && (
          <p className={l.proText}>
            {liveSessionKey !== null ? (
              <Link href={`/live/${liveSessionKey}`} className={ui.accent} style={{ fontWeight: 800 }}>
                ● Live now — open the pit wall →
              </Link>
            ) : liveChecked && nextLive ? (
              <>
                No live session right now — next:{' '}
                <b>
                  {nextLive.meetingName} {nextLive.sessionName}
                </b>
                , {formatLocalDateTime(nextLive.dateStart)}
              </>
            ) : liveChecked ? (
              <>No live session right now — no upcoming session is scheduled.</>
            ) : (
              <>Checking live status…</>
            )}
          </p>
        )}
      </div>

      {/* What it is */}
      <div className={`${ui.cells} ${ui.ruled}`} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))' }}>
        {PRO_FEATURES.map((f) => (
          <div key={f.label} className={ui.cell}>
            <div className={l.feature}>
              <span aria-hidden="true" className={pro ? l.on : l.off} />
              {f.label}
            </div>
            <div className={ui.sub}>{f.sub}</div>
          </div>
        ))}
      </div>

      {/* The exchange itself — code, expiry, sign out — lives in Settings. */}
      <div className={l.proBody}>
        <Link href="/settings" className={l.textLink}>
          {pro ? 'Manage your PRO access in Settings' : 'Have an access code? Enter it in Settings'} →
        </Link>
      </div>
    </section>
  )
}

/* ── pieces ──────────────────────────────────────────────────────────────── */

function SettingsLink({ pro, expiresAt }: { pro: boolean; expiresAt: number | null }) {
  const until = formatExpiry(expiresAt)
  if (pro) {
    return (
      <Link href="/settings" className={l.settingsLink} aria-label="PRO access active — manage in Settings">
        <span className={`${ui.badge} ${ui.badgeSolid} ${ui.toneAccent}`}>PRO access active</span>
        <span className={ui.sub}>{until ? `valid until ${until}` : 'valid on this browser'} — manage in Settings →</span>
      </Link>
    )
  }
  return (
    <Link href="/settings" className={l.settingsLink}>
      <span title={PRO_PRICE_LABEL} className={l.priceBox}>
        <span className={ui.label} style={{ color: 'var(--pw-text)', fontWeight: 800 }}>Coming soon</span>
        <span className={l.price}>€2.99 / month</span>
      </span>
      <span className={ui.sub} style={{ maxWidth: 240 }}>{PRO_PRICE_LABEL} — have a code? Settings →</span>
    </Link>
  )
}

function Bay({ label, sub, unlocked, accent }: {
  label: string
  sub: string
  unlocked: boolean
  accent?: boolean
}) {
  return (
    <div title={unlocked ? undefined : PRO_PRICE_LABEL} className={`${ui.cell} ${unlocked ? '' : l.sealed}`}>
      <div className={l.bayTop}>
        <div className={`${ui.mid} ${accent && unlocked ? ui.accent : ''}`} style={{ opacity: unlocked ? 1 : 0.7 }}>{label}</div>
        <span className={unlocked ? l.on : l.lock} aria-hidden="true" />
      </div>
      <div className={ui.label}>{sub}</div>
      <span className={ui.srOnly}>{unlocked ? 'unlocked' : 'locked — PRO'}</span>
    </div>
  )
}

function SeasonBay({ year, unlocked, current, nextRace }: {
  year: number
  unlocked: boolean
  current: boolean
  nextRace?: NextRaceCardInfo | null
}) {
  const sub = current
    ? nextRace?.status === 'processing'
      ? 'analysis processing'
      : nextRace
        ? 'race weekend ahead'
        : 'current season'
    : 'full season'
  return (
    <Bay label={String(year)} sub={sub} unlocked={unlocked} accent={current} />
  )
}

function LiveBay({ unlocked, live, checked }: { unlocked: boolean; live: boolean; checked: boolean }) {
  const sub = live ? 'live now' : checked ? 'no live session' : 'in build'
  return <Bay label="LIVE" sub={sub} unlocked={unlocked} accent={live} />
}
