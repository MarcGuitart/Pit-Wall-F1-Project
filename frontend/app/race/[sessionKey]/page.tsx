'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useRaceAnalysis } from '@/hooks/useRaceAnalysis'
import { AppShell } from '@/components/layout/AppShell'
import { AnalysisLoadingScreen } from '@/components/analysis/AnalysisLoadingScreen'
import { AnalysisPage } from '@/components/analysis/AnalysisPage'
import { BlockedPage, type BlockedKind } from '@/components/analysis/loader/BlockedPage'
import { useSessionMeta } from '@/lib/sessionMeta'
import { useArrival } from '@/lib/arrival'
import { loadStartedAt } from '@/lib/loadPhase'
import type { AnalysisError } from '@/lib/errors'
import { PRODUCT_NAME } from '@/lib/brand'
import { raceBreadcrumb } from '@/lib/sessionFacts'
import { placeOf } from '@/lib/place'

/** Which no-analysis page an error is, or null for the loader's own state 4 / a generic failure. */
function blockedKind(error: AnalysisError): BlockedKind {
  switch (error.code) {
    case 'PRO_REQUIRED': return 'pro'
    case 'SESSION_CANCELLED': return 'cancelled'
    case 'SESSION_NOT_FOUND': return 'notfound'
    case 'SESSION_NOT_HISTORICAL_YET': return 'unpublished'
    case 'OPENF1_RATE_LIMIT': return 'rate'
    default: return 'failed'
  }
}

/**
 * /race/{key} (Block 27): loader → arrival → page, or one of the pages with
 * no analysis. The header's facts come from /sessions/{key}/meta, asked in
 * parallel with /analysis, so a cancelled or unknown session is answered
 * without waiting for the analysis server.
 */
export default function RacePage() {
  const params = useParams()
  const sessionKey = Number(params.sessionKey)
  const valid = Number.isInteger(sessionKey) && sessionKey > 0

  const { data: analysis, error, retry } = useRaceAnalysis(valid ? sessionKey : null)
  const { meta, notFound } = useSessionMeta(valid ? sessionKey : null)
  const [startedAt, setStartedAt] = useState(() => (valid ? loadStartedAt(sessionKey) : Date.now()))
  const stage = useArrival(startedAt, Boolean(analysis))

  useEffect(() => {
    if (analysis) document.title = `${meta ? placeOf(meta) : analysis.race.circuit_short_name ?? `Session ${analysis.race.session_key}`} ${analysis.race.year} · ${PRODUCT_NAME}`
    return () => { document.title = `${PRODUCT_NAME} · Race Strategy Intelligence` }
  }, [analysis, meta])

  const again = () => {
    retry()
    setStartedAt(loadStartedAt(sessionKey))
  }

  if (!valid) {
    return <AppShell><BlockedPage kind="notfound" sessionKey={0} meta={null} /></AppShell>
  }

  if (analysis && (stage === 'done' || stage === 'arriving')) {
    const breadcrumb = [
      { label: String(analysis.race.year), href: '/races' },
      { label: meta ? placeOf(meta) : analysis.race.circuit_short_name ?? `Session ${analysis.race.session_key}`, href: '/races' },
      { label: analysis.race.session_name },
    ]
    return (
      <AppShell breadcrumb={breadcrumb}>
        <div style={{ position: 'relative' }}>
          <AnalysisPage analysis={analysis} meta={meta} arriving={stage === 'arriving'} />
          {stage === 'arriving' && <AnalysisLoadingScreen sessionKey={sessionKey} startedAt={startedAt} meta={meta} leaving />}
        </div>
      </AppShell>
    )
  }

  if (!analysis) {
    let blocked: { kind: BlockedKind; err?: AnalysisError } | null = null
    if (notFound) blocked = { kind: 'notfound' }
    else if (meta?.is_cancelled) blocked = { kind: 'cancelled' }
    else if (error && error.code !== 'ANALYSIS_TIMEOUT') blocked = { kind: blockedKind(error), err: error }
    if (blocked) {
      return (
        <AppShell breadcrumb={raceBreadcrumb(meta)}>
          <BlockedPage
            kind={blocked.kind}
            sessionKey={sessionKey}
            meta={meta}
            earliestAt={blocked.err?.unlockAtUtc ?? null}
            retryAfterSeconds={blocked.err?.retryAfterSeconds}
            message={blocked.err?.message}
            onRetry={again}
            onUnlocked={again}
          />
        </AppShell>
      )
    }
  }

  // Loading, the 300 ms hold before arrival, or state 4 (aborted at 45 s).
  return (
    <AppShell breadcrumb={raceBreadcrumb(meta)}>
      <AnalysisLoadingScreen
        sessionKey={sessionKey}
        startedAt={startedAt}
        meta={meta}
        failed={error?.code === 'ANALYSIS_TIMEOUT'}
        onRetry={again}
      />
    </AppShell>
  )
}
