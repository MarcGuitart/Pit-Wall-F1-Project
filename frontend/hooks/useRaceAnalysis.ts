'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { FullRaceAnalysis } from '@/types'
import type { AnalysisError } from '@/lib/errors'
import { fetchAnalysis } from '@/lib/api'
import { parseAnalysisError } from '@/lib/errors'
import { useRaceStore } from '@/stores/raceStore'
import { LOADING_STEPS } from '@/lib/constants'

const STEP_INTERVAL_MS = 1400

type UseRaceAnalysisState = {
  loading: boolean
  data: FullRaceAnalysis | null
  error: AnalysisError | null
  retry: () => void
}

// Module-level in-flight set — survives React Strict Mode double-mount
const inFlight = new Set<number>()

export function useRaceAnalysis(sessionKey: number | null): UseRaceAnalysisState {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AnalysisError | null>(null)
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const {
    analysis,
    setAnalysis,
    clearAnalysis,
    setIsLoading,
    setLoadingStep,
    setCurrentSessionKey,
    setError: setStoreError,
  } = useRaceStore()

  const stopStepTimer = useCallback(() => {
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current)
      stepTimerRef.current = null
    }
  }, [])

  const startStepTimer = useCallback(() => {
    setLoadingStep(0)
    stepTimerRef.current = setInterval(() => {
      setLoadingStep((prev: number) => Math.min(prev + 1, LOADING_STEPS.length - 1))
    }, STEP_INTERVAL_MS)
  }, [setLoadingStep])

  const doFetch = useCallback(
    async (key: number) => {
      if (inFlight.has(key)) return
      inFlight.add(key)

      setLoading(true)
      setIsLoading(true)
      setError(null)
      setStoreError(null)
      setCurrentSessionKey(key)
      startStepTimer()

      try {
        const data = await fetchAnalysis(key)
        stopStepTimer()
        setLoadingStep(LOADING_STEPS.length - 1)
        await new Promise((r) => setTimeout(r, 400))
        setAnalysis(data)
        setError(null)
        setStoreError(null)
      } catch (err) {
        stopStepTimer()
        const analysisError = parseAnalysisError(err)
        setError(analysisError)
        setStoreError(analysisError.message)
      } finally {
        setLoading(false)
        setIsLoading(false)
        inFlight.delete(key)
      }
    },
    [
      setAnalysis,
      setCurrentSessionKey,
      setIsLoading,
      setLoadingStep,
      setStoreError,
      startStepTimer,
      stopStepTimer,
    ],
  )

  const retry = useCallback(() => {
    if (!sessionKey) return
    clearAnalysis()
    setError(null)
    setStoreError(null)
    doFetch(sessionKey)
  }, [sessionKey, clearAnalysis, setStoreError, doFetch])

  useEffect(() => {
    if (!sessionKey) return

    // Already have data for this session — no fetch needed
    if (analysis?.race.session_key === sessionKey) return

    doFetch(sessionKey)

    return () => {
      stopStepTimer()
    }
  }, [sessionKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    loading,
    data: analysis?.race.session_key === sessionKey ? analysis : null,
    error,
    retry,
  }
}
