'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { COVER_MS, LONG_WAIT_MS, UNCOVER_MS, elapsedClock, giveUpAfter, uncoverAt, useSweep } from '@/lib/sweep'
import { ui } from '@/components/ui'
import s from './sweep.module.css'

/**
 * The diagonal sweep's bands and the clock that moves them (block 34,
 * lib/sweep.ts). Mounted once in the root layout so it survives the route
 * change it covers: each page renders its own AppShell, which would remount
 * the bands mid sweep. The phase is mirrored on <html data-sweep> for tests
 * and the preflight's captures.
 *
 * While the bands cover (block 48), the dark band says what is happening, with
 * nothing it cannot know: "Loading <destination>", the real time since the
 * click (mm:ss), and the Settle strip's red stroke, whose opacity is the only
 * thing that loops. From 8 s without the route: "This is taking longer than
 * usual". No percentage, no count, no bar that advances.
 */
/** Re-renders every 250 ms while `on`, for the elapsed clock. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [on])
  return now
}

export function SweepOverlay() {
  const pathname = usePathname()
  const { phase, href, label, direction, startedAt, uncoverFrom, gaveUp, set, reset } = useSweep()
  const waiting = phase === 'cover' || phase === 'hold'
  const now = useNow(waiting)

  useEffect(() => {
    const root = document.documentElement
    if (phase === 'idle') delete root.dataset.sweep
    else root.dataset.sweep = phase
  }, [phase])

  // cover → hold when the bands are in.
  useEffect(() => {
    if (phase !== 'cover') return
    const t = setTimeout(() => set({ phase: 'hold' }), Math.max(0, startedAt + COVER_MS - Date.now()))
    return () => clearTimeout(t)
  }, [phase, startedAt, set])

  // hold → uncover once the route is here (and the 120 ms hold is over), or at 8 s regardless.
  // Reruns when the pathname changes, so the 8 s timer is replaced once the route arrives.
  useEffect(() => {
    if (phase !== 'cover' && phase !== 'hold') return
    const ready = href !== null && pathname === href.split(/[?#]/)[0]
    const { at, gaveUp: late } = uncoverAt(startedAt, ready ? Date.now() : null, giveUpAfter(href))
    const t = setTimeout(() => {
      if (useSweep.getState().phase !== 'idle') set({ phase: 'uncover', gaveUp: late, uncoverFrom: at })
    }, Math.max(0, at - Date.now()))
    return () => clearTimeout(t)
  }, [phase, pathname, href, startedAt, set])

  // uncover → idle.
  useEffect(() => {
    if (phase !== 'uncover') return
    const t = setTimeout(reset, Math.max(0, uncoverFrom + UNCOVER_MS - Date.now()))
    return () => clearTimeout(t)
  }, [phase, uncoverFrom, reset])

  if (phase === 'idle') return null
  const elapsed = Math.max(0, now - startedAt)
  const long = waiting && elapsed >= LONG_WAIT_MS
  return (
    <div
      // The system root's class, for its tokens; its ground would cover the page, so none here.
      className={`${ui.root} ${s.layer}`}
      data-theme="dark"
      style={{ background: 'transparent' }}
      data-phase={phase}
      data-direction={direction}
      data-gave-up={gaveUp ? 'true' : undefined}
    >
      <div className={`${s.band} ${s.accent}`} aria-hidden="true" />
      <div className={`${s.band} ${s.ground}`}>
        <div className={s.upright}>
          <span className={s.label} aria-hidden="true">{label}</span>
          {waiting && (
            <div className={s.wait} role="status" aria-live="polite" data-sweep-wait={long ? 'long' : 'loading'}>
              <span className={s.waitHead}>
                <span className={s.stroke} aria-hidden="true" data-sweep-stroke />
                <span>Loading {label}</span>
                <span className={s.clock} aria-hidden="true" data-sweep-clock>{elapsedClock(elapsed)}</span>
              </span>
              {long && <span className={s.waitLong}>This is taking longer than usual</span>}
            </div>
          )}
        </div>
      </div>
      <div className={`${s.band} ${s.grey}`} aria-hidden="true" />
    </div>
  )
}
