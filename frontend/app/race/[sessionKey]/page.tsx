'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useRaceAnalysis } from '@/hooks/useRaceAnalysis'
import { AppShell } from '@/components/layout/AppShell'
import { AnalysisLoadingScreen } from '@/components/analysis/AnalysisLoadingScreen'
import { AnalysisPage } from '@/components/analysis/AnalysisPage'
import { SessionUnavailableState } from '@/components/analysis/SessionUnavailableState'
import { ProWall } from '@/components/access/ProWall'
import { PRODUCT_NAME } from '@/lib/brand'
import { buttonClass, ui } from '@/components/ui'
import s from '@/components/analysis/states.module.css'

export default function RacePage() {
  const params = useParams()
  const router = useRouter()
  const sessionKey = Number(params.sessionKey)

  const { loading, data: analysis, error, retry } = useRaceAnalysis(
    isNaN(sessionKey) ? null : sessionKey,
  )

  // Update browser tab title once race data is available — must be before any early return
  useEffect(() => {
    if (analysis) {
      document.title = `${analysis.race.meeting_name} ${analysis.race.year} · ${PRODUCT_NAME}`
    }
    return () => {
      document.title = `${PRODUCT_NAME} — Race Strategy Intelligence`
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
    // Not a failure: the race exists and works, it is simply behind the wall.
    // This is the path someone takes when a PRO link is shared with them.
    if (error.code === 'PRO_REQUIRED') {
      return (
        <AppShell>
          <div className={s.center}>
            <ProWall variant="system" year={error.year ?? null} onUnlocked={() => retry()} />
          </div>
        </AppShell>
      )
    }

    if (
      error.code === 'SESSION_NOT_HISTORICAL_YET' ||
      error.code === 'SESSION_NOT_CACHED' ||
      error.code === 'OPENF1_RATE_LIMIT' ||
      error.code === 'OPENF1_ERROR'
    ) {
      return (
        <AppShell>
          <div className={s.center}>
            <SessionUnavailableState
              code={error.code}
              message={error.message}
              unlockAtUtc={error.unlockAtUtc}
              retryAfterMinutes={error.retryAfterMinutes}
              onRetry={() => retry()}
              sessionKey={sessionKey}
            />
          </div>
        </AppShell>
      )
    }

    // ANALYSIS_FAILED, ANALYSIS_TIMEOUT (aborted at 45 s) or UNKNOWN — generic error with retry
    return (
      <AppShell>
        <div className={s.center}>
          <section className={s.card} style={{ boxShadow: 'inset 0 4px 0 var(--pw-accent)' }} role="alert">
            <div className={ui.label} style={{ color: 'var(--pw-accent-text)', fontWeight: 800 }}>
              {error.code === 'ANALYSIS_TIMEOUT' ? 'No answer from the analysis server' : 'Analysis Failed'}
            </div>
            <p className={s.message}>{error.message}</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => retry()} className={buttonClass('primary')}>Retry</button>
              <button type="button" onClick={() => router.push('/')} className={buttonClass()}>Back</button>
            </div>
          </section>
        </div>
      </AppShell>
    )
  }

  if (loading || !analysis) {
    return (
      <AppShell>
        <AnalysisLoadingScreen raceName={raceName} sessionKey={sessionKey} />
      </AppShell>
    )
  }

  return (
    <AppShell breadcrumb={breadcrumb}>
      <AnalysisPage analysis={analysis} />
    </AppShell>
  )
}
