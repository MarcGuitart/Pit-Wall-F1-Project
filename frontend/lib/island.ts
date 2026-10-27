'use client'

import { useEffect, useState } from 'react'

/** Every landing island gives up after this long (Block 29). */
export const ISLAND_TIMEOUT_MS = 3000

export type Island<T> = { status: 'loading' } | { status: 'ok'; data: T } | { status: 'unavailable' }

/** Resolve `p`, or reject after `ms`. */
export function withTimeout<T>(p: Promise<T>, ms = ISLAND_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

/**
 * A client island: 'loading' on the server and on the first client render (so
 * the static HTML and hydration agree), then 'ok' or 'unavailable' — never a
 * sample value. Callers reserve the same height for all three states.
 */
export function useIsland<T>(load: () => Promise<T>, ms = ISLAND_TIMEOUT_MS): Island<T> {
  const [state, setState] = useState<Island<T>>({ status: 'loading' })
  useEffect(() => {
    let live = true
    withTimeout(load(), ms)
      .then((data) => { if (live) setState({ status: 'ok', data }) })
      .catch(() => { if (live) setState({ status: 'unavailable' }) })
    return () => { live = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}

/** One request for the next session, shared by the hero card and the live card. */
let nextSession: Promise<unknown> | null = null
export function shared<T>(make: () => Promise<T>): Promise<T> {
  if (!nextSession) nextSession = make().catch((e) => { nextSession = null; throw e })
  return nextSession as Promise<T>
}
