'use client'

import { useParams } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { AnalysisLoadingScreen } from '@/components/analysis/AnalysisLoadingScreen'

/**
 * Shown by Next while it fetches this dynamic route — on Netlify a serverless
 * function that may be cold. Without it, a click on a race left the previous
 * page on screen with no sign of anything happening until the route arrived
 * (seconds, on a cold function). Same loader and same clock as the page's own
 * wait for /analysis, so the two read as one; under 300 ms it shows nothing.
 */
export default function RaceLoading() {
  const key = Number(useParams()?.sessionKey)
  return (
    <AppShell>
      <AnalysisLoadingScreen sessionKey={Number.isNaN(key) ? undefined : key} />
    </AppShell>
  )
}
