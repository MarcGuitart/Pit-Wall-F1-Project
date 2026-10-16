'use client'

import { useEffect, useState, useCallback } from 'react'
import type { FullRaceAnalysis } from '@/types'
import type { AnalysisError } from '@/lib/errors'
import { fetchAnalysis } from '@/lib/api'
import { parseAnalysisError } from '@/lib/errors'
import { useRaceStore } from '@/stores/raceStore'
import { TIMEOUT_AFTER_MS, loadStartedAt, resetLoadClock } from '@/lib/loadPhase'

type UseRaceAnalysisState = {
  loading: boolean
  data: FullRaceAnalysis | null
  error: AnalysisError | null
  retry: () => void
}

// Module-level in-flight set — survives React Strict Mode double-mount
const inFlight = new Set<number>()

export const TIMEOUT_ERROR: AnalysisError = {
  code: 'ANALYSIS_TIMEOUT',
  message:
    'The analysis server did not answer within 45 seconds. It may still be waking up — try again.',
}

/**
 * One GET /analysis/{key}. There is no progress to report: the loader on the
 * page shows elapsed time only (lib/loadPhase.ts). The request is aborted
 * after TIMEOUT_AFTER_MS, counted from when this session's load started
 * (which may be the route's loading.tsx, before this hook mounted), and the
 * page offers a retry. Unmounting does not abort: the answer still lands in
 * the store for when the reader comes back.
 */
export function useRaceAnalysis(sessionKey: number | null): UseRaceAnalysisState {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AnalysisError | null>(null)

  const {
    analysis,
    setAnalysis,
    clearAnalysis,
    setIsLoading,
    setCurrentSessionKey,
    setError: setStoreError,
  } = useRaceStore()

  const doFetch = useCallback(
    async (key: number) => {
      if (inFlight.has(key)) return
      inFlight.add(key)

      setLoading(true)
      setIsLoading(true)
      setError(null)
      setStoreError(null)
      setCurrentSessionKey(key)

      const controller = new AbortController()
      const left = Math.max(0, loadStartedAt(key) + TIMEOUT_AFTER_MS - Date.now())
      let timedOut = false
      const timer = setTimeout(() => { timedOut = true; controller.abort() }, left)

      try {
        const data = await fetchAnalysis(key, controller.signal)
        setAnalysis(data)
        setError(null)
        setStoreError(null)
      } catch (err) {
        const analysisError = timedOut ? TIMEOUT_ERROR : parseAnalysisError(err)
        setError(analysisError)
        setStoreError(analysisError.message)
      } finally {
        clearTimeout(timer)
        resetLoadClock(key)
        setLoading(false)
        setIsLoading(false)
        inFlight.delete(key)
      }
    },
    [setAnalysis, setCurrentSessionKey, setIsLoading, setStoreError],
  )

  const retry = useCallback(() => {
    if (!sessionKey) return
    clearAnalysis()
    setError(null)
    setStoreError(null)
    resetLoadClock(sessionKey)
    doFetch(sessionKey)
  }, [sessionKey, clearAnalysis, setStoreError, doFetch])

  useEffect(() => {
    if (!sessionKey) return

    // Already have data for this session — no fetch needed
    if (analysis?.race.session_key === sessionKey) return

    doFetch(sessionKey)
  }, [sessionKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    loading,
    data: analysis?.race.session_key === sessionKey ? analysis : null,
    error,
    retry,
  }
}
