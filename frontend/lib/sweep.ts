import { create } from 'zustand'
import { WAKING_AFTER_MS } from '@/lib/loadPhase'

/**
 * The diagonal sweep (block 34): three skewed bands cross the screen when a
 * click opens a race or live mode, and leave over the destination's loader.
 *
 *   cover    0 to 260 ms      the bands come in
 *   hold     at least 120 ms, then until the route has arrived
 *   uncover  320 ms           the bands leave, over the skeleton of block 27
 *
 * A fast route is done in 700 ms (260 + 120 + 320). A slow one never keeps the
 * bands past WAKING_AFTER_MS (8 s): they leave and the loader says the server
 * is waking. Live mode sweeps the other way.
 *
 * Only a plain click sweeps. Not a modified or middle click (a new tab), not
 * back or forward (nothing calls navigateWithSweep then), not with reduced
 * motion, not to the page already open, not to any other route.
 */
export const COVER_MS = 260
export const HOLD_MS = 120
export const UNCOVER_MS = 320
export const GIVE_UP_MS = WAKING_AFTER_MS

export type SweepPhase = 'idle' | 'cover' | 'hold' | 'uncover'
export type SweepDirection = 'forward' | 'reverse'

export function sweepTarget(href: string): 'race' | 'live' | null {
  const path = href.split(/[?#]/)[0]
  if (/^\/race\/\d+$/.test(path)) return 'race'
  if (/^\/live\/\d+$/.test(path)) return 'live'
  return null
}

export type ClickLike = {
  button?: number
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  defaultPrevented?: boolean
  /** The event's timeStamp (performance clock): the sweep's clock starts at the click. */
  timeStamp?: number
}

export function shouldSweep(href: string, pathname: string, click: ClickLike | null | undefined, reducedMotion: boolean): boolean {
  if (!click) return false                       // programmatic: not a click
  if (click.defaultPrevented) return false
  if ((click.button ?? 0) !== 0) return false     // middle or right button
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false
  if (reducedMotion) return false
  if (sweepTarget(href) === null) return false
  return href.split(/[?#]/)[0] !== pathname
}

/**
 * When the bands start to leave, given when the cover ended and when the
 * route arrived (null: not yet). Never later than GIVE_UP_MS from the click.
 */
export function uncoverAt(startedAt: number, readyAt: number | null): { at: number; gaveUp: boolean } {
  const earliest = startedAt + COVER_MS + HOLD_MS
  const limit = startedAt + GIVE_UP_MS
  if (readyAt !== null && Math.max(earliest, readyAt) <= limit) return { at: Math.max(earliest, readyAt), gaveUp: false }
  return { at: limit, gaveUp: true }
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

type SweepState = {
  phase: SweepPhase
  href: string | null
  label: string
  direction: SweepDirection
  startedAt: number
  /** When the uncover was due (not when React got to it): the end is timed from here. */
  uncoverFrom: number
  gaveUp: boolean
  start: (href: string, label: string, at?: number) => void
  set: (patch: Partial<Pick<SweepState, 'phase' | 'gaveUp' | 'uncoverFrom'>>) => void
  reset: () => void
}

export const useSweep = create<SweepState>((set) => ({
  phase: 'idle',
  href: null,
  label: '',
  direction: 'forward',
  startedAt: 0,
  uncoverFrom: 0,
  gaveUp: false,
  start: (href, label, at = Date.now()) => set({
    phase: 'cover', href, label, gaveUp: false, startedAt: at,
    direction: sweepTarget(href) === 'live' ? 'reverse' : 'forward',
  }),
  set: (patch) => set(patch),
  reset: () => set({ phase: 'idle', href: null, label: '', gaveUp: false }),
}))

/** When the click happened, on the Date clock (the sweep's timers use Date.now). */
export function clickedAt(click: ClickLike | null | undefined): number {
  const now = Date.now()
  if (!click || typeof click.timeStamp !== 'number' || typeof performance === 'undefined') return now
  const ago = performance.now() - click.timeStamp
  return ago > 0 && ago < 1000 ? now - ago : now
}
