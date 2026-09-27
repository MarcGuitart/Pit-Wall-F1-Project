'use client'

/**
 * The PRO section of the landing page.
 *
 * Two states, one component. Locked: the PRO seasons as sealed garage bays, a
 * "Coming soon" price button that promises nothing it cannot deliver, and a code
 * field for whoever already has one. Unlocked: the same bays open, the expiry
 * visible, and a way out.
 *
 * The UI decides nothing. Every PRO request is gated on the backend and refused
 * there with PRO_REQUIRED; a locked bay here is a courtesy, not a security
 * boundary, and clicking one goes to the same page it always did — the backend
 * answers.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchAccessStatus, redeemAccessCode, signOutOfPro, type AccessStatus } from '@/lib/api'
import { ACCESS_CHANGED_EVENT, PRO_PRICE_LABEL, proSeasons } from '@/lib/access'
import { ApiError } from '@/lib/errors'
import { formatLocalDateTime, formatUtcTime } from '@/lib/format'
import { fetchNextRaceCardInfo, type NextRaceCardInfo } from '@/lib/nextSession'
import { fetchLiveServerStatus, fetchNextLiveSession, type NextLiveSessionInfo } from '@/lib/liveStatus'
import { AddToCalendarButton } from '@/components/ui/AddToCalendarButton'
import Link from 'next/link'

const PRO_FEATURES = [
  { label: 'Races from 2025', sub: 'every session, fully analysed' },
  { label: 'The current season', sub: 'on the site within hours of the flag' },
  { label: 'Live mode', sub: 'the race as it happens — in build' },
]

const REDEEM_ERROR: Record<string, string> = {
  INVALID_ACCESS_CODE: 'That code is not valid.',
  RATE_LIMITED: 'Too many attempts. Wait a few minutes and try again.',
  PRO_ACCESS_UNAVAILABLE: 'Access codes are not switched on yet.',
}

function formatExpiry(epochSeconds: number | null): string | null {
  if (!epochSeconds) return null
  return new Date(epochSeconds * 1000).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function ProSection() {
  const [status, setStatus] = useState<AccessStatus | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showField, setShowField] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(() => {
    fetchAccessStatus().then(setStatus)
  }, [])

  useEffect(() => {
    refresh()
    window.addEventListener(ACCESS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(ACCESS_CHANGED_EVENT, refresh)
  }, [refresh])

  useEffect(() => {
    if (showField) inputRef.current?.focus()
  }, [showField])

  const pro = status?.pro === true
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

  // Live status: only checked for a PRO visitor, since the live server itself
  // is the only source of truth for "data is arriving" — never the clock alone
  // (a session can start late). Polled, not fetched once: the point of this
  // caption is to flip to a link the moment the session actually starts,
  // while someone might be sitting on this page.
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
    const id = setInterval(poll, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [pro, currentSeasonYear])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = code.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      setStatus(await redeemAccessCode(trimmed))
      setCode('')
      setShowField(false)
    } catch (err) {
      const apiCode = err instanceof ApiError ? err.code : ''
      setError(REDEEM_ERROR[apiCode] ?? 'Could not check that code. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section
      id="pro"
      className="w-full border-y border-border-subtle bg-bg-secondary"
      aria-labelledby="pro-heading"
    >
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header strip */}
        <div className="flex items-start justify-between gap-6 flex-wrap mb-7">
          <div>
            <div className="inline-flex items-center gap-2 mb-2">
              <span
                className={`w-1.5 h-1.5 rounded-full ${pro ? 'bg-signal-green' : 'bg-signal-amber'}`}
                aria-hidden="true"
              />
              <span className="font-display font-bold text-[9px] uppercase tracking-[2px] text-text-muted">
                {pro ? 'Access granted' : 'Restricted area'}
              </span>
            </div>
            <h2
              id="pro-heading"
              className="font-display font-black text-[34px] md:text-[42px] leading-[0.95] uppercase tracking-[-0.5px] text-text-primary"
            >
              Pit Wall <span className="text-signal-red">PRO</span>
            </h2>
            <p className="font-body text-[14px] text-text-secondary mt-2 max-w-md leading-relaxed">
              {pro
                ? 'Every season is open on this browser. The pit wall is yours.'
                : 'The free seasons are 2023 and 2024. Everything newer sits behind the wall.'}
            </p>
          </div>

          {pro ? <ActiveBadge status={status} onSignOut={() => { signOutOfPro(); refresh() }} />
               : <ComingSoon />}
        </div>

        {/* The bays */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
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

        {/* The current season's real calendar, not a placeholder */}
        {nextRace && (
          <div className="flex items-center gap-2 flex-wrap mb-6">
            <p className="font-mono text-[10px] text-text-muted leading-relaxed">
              {nextRace.status === 'processing' ? (
                <>
                  <span className="text-signal-amber">{nextRace.meetingName}</span> has finished —
                  analysis processing. It publishes automatically once the data settles; no fixed time.
                </>
              ) : (
                <>
                  Next: <span className="text-text-secondary">{nextRace.meetingName}</span>
                  {nextRace.circuitShortName ? ` (${nextRace.circuitShortName})` : ''} — runs from{' '}
                  <span className="text-text-secondary">{formatLocalDateTime(nextRace.dateStart)}</span>
                  {nextRace.dateEnd && <> · race ends {formatUtcTime(nextRace.dateEnd)}</>}
                </>
              )}
            </p>
            {nextRace.status === 'upcoming' && nextRace.dateEnd && (
              <AddToCalendarButton
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
        {!nextRace && <div className="mb-6" />}

        {/* Live: a real link once data is arriving, never a guess from the clock */}
        {pro && (
          <p className="font-mono text-[10px] text-text-muted mb-6 leading-relaxed">
            {liveSessionKey !== null ? (
              <Link
                href={`/live/${liveSessionKey}`}
                className="text-signal-green hover:underline underline-offset-4"
              >
                ● Live now — open the pit wall →
              </Link>
            ) : liveChecked && nextLive ? (
              <>
                No live session right now — next:{' '}
                <span className="text-text-secondary">
                  {nextLive.meetingName} {nextLive.sessionName}
                </span>
                , {formatLocalDateTime(nextLive.dateStart)}
              </>
            ) : liveChecked ? (
              <>No live session right now — no upcoming session is scheduled.</>
            ) : (
              <>Checking live status…</>
            )}
          </p>
        )}

        {/* What it is */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border-subtle border border-border-subtle rounded-[4px] overflow-hidden mb-6">
          {PRO_FEATURES.map((f) => (
            <div key={f.label} className="bg-bg-panel px-4 py-3">
              <div className="flex items-center gap-2">
                <span
                  className={`font-mono text-[10px] ${pro ? 'text-signal-green' : 'text-text-muted'}`}
                  aria-hidden="true"
                >
                  {pro ? '●' : '○'}
                </span>
                <span className="font-display font-bold text-[12px] uppercase tracking-[0.5px] text-text-primary">
                  {f.label}
                </span>
              </div>
              <div className="font-mono text-[9px] text-text-muted mt-1 pl-[18px]">{f.sub}</div>
            </div>
          ))}
        </div>

        {/* The code field */}
        {!pro && (
          <div className="border-t border-border-subtle pt-5">
            {!showField ? (
              <button
                type="button"
                onClick={() => setShowField(true)}
                className="font-mono text-[11px] text-text-secondary hover:text-signal-blue transition-colors underline underline-offset-4 decoration-border-default"
              >
                I already have an access code
              </button>
            ) : (
              <form onSubmit={submit} className="flex flex-wrap items-start gap-2">
                <div className="flex-1 min-w-[220px]">
                  <label
                    htmlFor="pro-code"
                    className="block font-display font-bold text-[9px] uppercase tracking-[1.5px] text-text-muted mb-1.5"
                  >
                    Access code
                  </label>
                  <input
                    ref={inputRef}
                    id="pro-code"
                    type="text"
                    value={code}
                    onChange={(e) => { setCode(e.target.value); setError(null) }}
                    placeholder="PW-…"
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={error !== null}
                    aria-describedby={error ? 'pro-code-error' : undefined}
                    className="w-full bg-bg-primary border border-border-default rounded-[3px] px-3 py-2
                               font-mono text-[12px] text-text-primary placeholder:text-text-muted
                               focus:outline-none focus:border-signal-blue transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting || code.trim().length === 0}
                  className="mt-[22px] px-4 py-2 rounded-[3px] border border-signal-red bg-signal-red/10
                             font-display font-bold text-[10px] uppercase tracking-[1.5px] text-signal-red
                             hover:bg-signal-red/20 disabled:opacity-40 disabled:hover:bg-signal-red/10
                             disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Checking…' : 'Unlock'}
                </button>
              </form>
            )}

            <p
              id="pro-code-error"
              role="status"
              aria-live="polite"
              className={`font-mono text-[10px] mt-2 ${error ? 'text-signal-red' : 'sr-only'}`}
            >
              {error ?? ''}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

/* ── pieces ──────────────────────────────────────────────────────────────── */

function ComingSoon() {
  return (
    <div className="text-right">
      <button
        type="button"
        disabled
        aria-disabled="true"
        title={PRO_PRICE_LABEL}
        className="group px-4 py-2.5 rounded-[3px] border border-signal-amber/40 bg-signal-amber/[0.07]
                   cursor-not-allowed text-left"
      >
        <div className="font-display font-bold text-[10px] uppercase tracking-[2px] text-signal-amber">
          Coming soon
        </div>
        <div className="font-mono text-[11px] text-text-secondary mt-0.5">€2.99 / month</div>
      </button>
      <p className="font-mono text-[9px] text-text-muted mt-1.5 max-w-[210px] leading-relaxed">
        {PRO_PRICE_LABEL}
      </p>
    </div>
  )
}

function ActiveBadge({ status, onSignOut }: { status: AccessStatus | null; onSignOut: () => void }) {
  const until = formatExpiry(status?.expires_at ?? null)
  return (
    <div className="text-right">
      <div className="inline-flex items-center gap-2 px-3 py-2 rounded-[3px] border border-signal-green/40 bg-signal-green/[0.07]">
        <span className="w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse" aria-hidden="true" />
        <span className="font-display font-bold text-[10px] uppercase tracking-[2px] text-signal-green">
          PRO access active
        </span>
      </div>
      <div className="font-mono text-[9px] text-text-muted mt-1.5">
        {until ? `valid until ${until}` : 'valid on this browser'}
      </div>
      <button
        type="button"
        onClick={onSignOut}
        className="font-mono text-[10px] text-text-muted hover:text-signal-red transition-colors mt-1 underline underline-offset-4 decoration-border-default"
      >
        Sign out of PRO
      </button>
    </div>
  )
}

function Bay({ label, sub, unlocked, accent }: {
  label: string
  sub: string
  unlocked: boolean
  accent?: boolean
}) {
  return (
    <div
      title={unlocked ? undefined : PRO_PRICE_LABEL}
      className={`group relative border rounded-[4px] px-3 py-4 overflow-hidden transition-colors
        ${unlocked
          ? 'border-signal-green/30 bg-signal-green/[0.04]'
          : 'border-border-default bg-bg-panel hover:border-signal-amber/50'}`}
    >
      {/* garage-door hatching, only while sealed */}
      {!unlocked && (
        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, #FFB020 0 6px, transparent 6px 12px)',
          }}
          aria-hidden="true"
        />
      )}
      <div className="relative flex items-start justify-between gap-2">
        <div>
          <div
            className={`font-display font-black text-[22px] leading-none tracking-[-0.5px]
              ${unlocked ? 'text-text-primary' : 'text-text-secondary'}
              ${accent && unlocked ? 'text-signal-green' : ''}`}
          >
            {label}
          </div>
          <div className="font-mono text-[8px] uppercase tracking-[1px] text-text-muted mt-1">
            {sub}
          </div>
        </div>
        <span
          className={`font-mono text-[11px] shrink-0 ${unlocked ? 'text-signal-green' : 'text-signal-amber/70'}`}
          aria-hidden="true"
        >
          {unlocked ? '◯' : '⬤'}
        </span>
      </div>
      <span className="sr-only">{unlocked ? 'unlocked' : 'locked — PRO'}</span>
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
