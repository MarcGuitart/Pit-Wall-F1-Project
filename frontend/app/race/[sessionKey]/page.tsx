'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useRaceStore } from '@/stores/raceStore'
import { fetchAnalysis } from '@/lib/api'
import { AppShell } from '@/components/layout/AppShell'
import { AnalysisLoadingScreen } from '@/components/analysis/AnalysisLoadingScreen'
import { AnalysisPage } from '@/components/analysis/AnalysisPage'
import { LOADING_STEPS } from '@/lib/constants'

const STEP_INTERVAL_MS = 1400

export default function RacePage() {
  const params = useParams()
  const router = useRouter()
  const sessionKey = Number(params.sessionKey)

  const {
    analysis,
    setAnalysis,
    isLoading,
    setIsLoading,
    loadingStep,
    setLoadingStep,
    setCurrentSessionKey,
    error,
    setError,
  } = useRaceStore()

  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  const loadAnalysis = useCallback(async () => {
    if (!sessionKey || isNaN(sessionKey)) {
      router.push('/')
      return
    }

    setIsLoading(true)
    setError(null)
    setCurrentSessionKey(sessionKey)
    startStepTimer()

    try {
      const data = await fetchAnalysis(sessionKey)
      stopStepTimer()
      setLoadingStep(LOADING_STEPS.length - 1)
      // Brief pause to show "done" state on last step
      await new Promise((r) => setTimeout(r, 400))
      setAnalysis(data)
    } catch (e) {
      stopStepTimer()
      setError(
        e instanceof Error
          ? e.message
          : 'Failed to load race analysis. Check that the backend is running.'
      )
    } finally {
      setIsLoading(false)
    }
  }, [
    sessionKey,
    router,
    setAnalysis,
    setCurrentSessionKey,
    setError,
    setIsLoading,
    setLoadingStep,
    startStepTimer,
    stopStepTimer,
  ])

  useEffect(() => {
    if (!analysis || analysis.race.session_key !== sessionKey) {
      loadAnalysis()
    }
    return () => stopStepTimer()
  }, [sessionKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const raceName = analysis
    ? `${analysis.race.meeting_name} ${analysis.race.year}`
    : `Session ${sessionKey}`

  const breadcrumb = analysis
    ? [
        { label: String(analysis.race.year), href: '/' },
        { label: analysis.race.meeting_name, href: '/' },
        { label: analysis.race.session_name },
      ]
    : [{ label: `Session ${sessionKey}` }]

  if (error) {
    return (
      <AppShell>
        <div className="min-h-[calc(100vh-48px)] flex items-center justify-center px-6">
          <div className="bg-bg-panel border border-signal-red/30 rounded-[4px] p-8 max-w-lg w-full">
            <div className="font-display font-bold text-[10px] uppercase tracking-[1.5px] text-signal-red mb-2">
              Analysis Failed
            </div>
            <p className="font-mono text-[13px] text-text-secondary mb-4 leading-relaxed">
              {error}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => loadAnalysis()}
                className="px-4 py-2 bg-signal-red text-white font-display font-bold text-[10px] uppercase tracking-[1px] rounded-[3px] hover:bg-red-600 transition-colors"
              >
                Retry
              </button>
              <button
                onClick={() => router.push('/')}
                className="px-4 py-2 bg-bg-elevated border border-border-default text-text-secondary font-display font-bold text-[10px] uppercase tracking-[1px] rounded-[3px] hover:text-text-primary transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      </AppShell>
    )
  }

  if (isLoading || !analysis) {
    return (
      <AppShell>
        <AnalysisLoadingScreen
          raceName={raceName}
          sessionKey={sessionKey}
          currentStep={loadingStep}
        />
      </AppShell>
    )
  }

  return (
    <AppShell breadcrumb={breadcrumb}>
      <AnalysisPage analysis={analysis} />
    </AppShell>
  )
}
