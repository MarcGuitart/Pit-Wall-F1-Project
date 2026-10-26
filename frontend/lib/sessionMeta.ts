'use client'

import { useEffect, useState } from 'react'
import type { SessionMeta } from '@/types'
import { fetchSessionMeta } from '@/lib/api'
import { ApiError } from '@/lib/errors'

/**
 * GET /sessions/{key}/meta, once per session per page load (Block 27).
 *
 * The route's loading.tsx and the race page both ask; they share one request
 * and one answer, so the header's facts do not flicker when the page mounts.
 * A 404 is remembered (the session does not exist); any other failure is not
 * — the loader simply keeps its bars, and the next visit asks again.
 */
export type MetaState = { meta: SessionMeta | null; notFound: boolean; settled: boolean }

const EMPTY: MetaState = { meta: null, notFound: false, settled: false }
const answers = new Map<number, MetaState>()
const pending = new Map<number, Promise<MetaState>>()

export function loadSessionMeta(sessionKey: number): Promise<MetaState> {
  const known = answers.get(sessionKey)
  if (known) return Promise.resolve(known)
  let p = pending.get(sessionKey)
  if (!p) {
    p = fetchSessionMeta(sessionKey)
      .then((meta): MetaState => {
        const state = { meta, notFound: false, settled: true }
        answers.set(sessionKey, state)
        return state
      })
      .catch((err): MetaState => {
        if (err instanceof ApiError && err.code === 'SESSION_NOT_FOUND') {
          const state = { meta: null, notFound: true, settled: true }
          answers.set(sessionKey, state)
          return state
        }
        return { meta: null, notFound: false, settled: true }
      })
      .finally(() => pending.delete(sessionKey))
    pending.set(sessionKey, p)
  }
  return p
}

export function useSessionMeta(sessionKey: number | null): MetaState {
  const [state, setState] = useState<MetaState>(() => (sessionKey != null && answers.get(sessionKey)) || EMPTY)
  useEffect(() => {
    if (sessionKey == null) return
    let live = true
    const known = answers.get(sessionKey)
    if (known) { setState(known); return }
    setState(EMPTY)
    loadSessionMeta(sessionKey).then((s) => { if (live) setState(s) })
    return () => { live = false }
  }, [sessionKey])
  return state
}

/** Test hook. */
export function __resetSessionMetaForTests() {
  answers.clear()
  pending.clear()
}
