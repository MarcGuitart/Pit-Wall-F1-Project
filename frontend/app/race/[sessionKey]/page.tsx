'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useRaceStore } from '@/stores/raceStore'
import { useRaceAnalysis } from '@/hooks/useRaceAnalysis'
import { AppShell } from '@/components/layout/AppShell'
import { AnalysisLoadingScreen } from '@/components/analysis/AnalysisLoadingScreen'
import { AnalysisPage } from '@/components/analysis/AnalysisPage'
import { SessionUnavailableState } from '@/components/analysis/SessionUnavailableState'

export default function RacePage() {
  const params = useParams()
  const router = useRouter()
  const sessionKey = Number(params.sessionKey)

  const { loadingStep } = useRaceStore()
  const { loading, data: analysis, error, retry } = useRaceAnalysis(
    isNaN(sessionKey) ? null : sessionKey,
  )

  // Update browser tab title once race data is available — must be before any early return
  useEffect(() => {
    if (analysis) {
      document.title = `${analysis.race.meeting_name} ${analysis.race.year} · Pit Wall IQ`
    }
    return () => {
      document.title = 'Pit Wall IQ — Race Strategy Intelligence'
    }
  }, [analysis])

  if (isNaN(sessionKey)) {
    router.push('/')
    return null
  }

  const raceName = analysis
    ? `${analysis.race.meeting_name} ${analysis.race.year}`
    : 'Loading…'

  const breadcrumb = analysis
    ? [
        { label: String(analysis.race.year), href: '/' },
        { label: analysis.race.meeting_name, href: '/' },
        { label: analysis.race.session_name },
      ]
    : []

  // Error states — map to SessionUnavailableState for structured errors
  if (error) {
    if (
      error.code === 'SESSION_NOT_HISTORICAL_YET' ||
      error.code === 'OPENF1_RATE_LIMIT' ||
      error.code === 'OPENF1_ERROR'
    ) {
      return (
        <AppShell>
          <div className="min-h-[calc(100vh-48px)] flex items-center justify-center px-6">
            <SessionUnavailableState
              code={error.code}
              message={error.message}
              unlockAtUtc={error.unlockAtUtc}
              retryAfterMinutes={error.retryAfterMinutes}
              onRetry={() => retry()}
            />
          </div>
        </AppShell>
      )
    }

    // ANALYSIS_FAILED or UNKNOWN — show generic error with retry
    return (
      <AppShell>
        <div className="min-h-[calc(100vh-48px)] flex items-center justify-center px-6">
          <div className="bg-bg-panel border border-signal-red/30 rounded-[4px] p-8 max-w-lg w-full">
            <div className="font-display font-bold text-[10px] uppercase tracking-[1.5px] text-signal-red mb-2">
              Analysis Failed
            </div>
            <p className="font-mono text-[13px] text-text-secondary mb-4 leading-relaxed">
              {error.message}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => retry()}
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

  if (loading || !analysis) {
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
