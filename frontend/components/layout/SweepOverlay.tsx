'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { COVER_MS, UNCOVER_MS, uncoverAt, useSweep } from '@/lib/sweep'
import s from './sweep.module.css'

/**
 * The diagonal sweep's bands and the clock that moves them (block 34,
 * lib/sweep.ts). Mounted once in the root layout so it survives the route
 * change it covers: each page renders its own AppShell, which would remount
 * the bands mid sweep. The phase is mirrored on <html data-sweep> for tests
 * and the preflight's captures.
 */
export function SweepOverlay() {
  const pathname = usePathname()
  const { phase, href, label, direction, startedAt, uncoverFrom, gaveUp, set, reset } = useSweep()

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
    const { at, gaveUp: late } = uncoverAt(startedAt, ready ? Date.now() : null)
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
  return (
    <div
      className={s.layer}
      data-phase={phase}
      data-direction={direction}
      data-gave-up={gaveUp ? 'true' : undefined}
      aria-hidden="true"
    >
      <div className={`${s.band} ${s.accent}`} />
      <div className={`${s.band} ${s.ground}`}>
        <span className={s.label}>{label}</span>
      </div>
      <div className={`${s.band} ${s.grey}`} />
    </div>
  )
}
