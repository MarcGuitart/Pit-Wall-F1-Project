'use client'

import { Component, useEffect, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { useLiveSession } from '@/hooks/useLiveSession'
import { ConnectionBanner } from '@/components/live/ConnectionBanner'
import { ProWall } from '@/components/access/ProWall'
import { PRODUCT_NAME } from '@/lib/brand'
import { LiveDashboard } from '@/components/live/dashboard/LiveDashboard'
import { NotLiveYet } from '@/components/live/dashboard/NotLiveYet'
import { PracticePitWall } from '@/components/live/PracticePitWall'
import { PositionTower } from '@/components/live/PositionTower'
import { LiveEngineerNotes } from '@/components/live/LiveEngineerNotes'
import type { LiveSnapshot } from '@/types/live'

/**
 * The pit wall during the race.
 *
 * Everything on this page comes from one process — the live server holding the
 * OpenF1 MQTT subscription — over a single SSE stream. The browser never
 * reaches OpenF1: the credentials are the project's and the broker's
 * subscriber budget is not per-viewer.
 *
 * Live is PRO. The stream carries the same signed token as every other PRO
 * request, and a refusal shows the same wall a PRO race shows — nothing has
 * gone wrong, the page is simply behind the code.
 *
 * Developed against the Baku recording, replayed at its real arrival times:
 *
 *   python scripts/live_server.py --replay-capture live/2026-09-26_race_11377 --speed 60
 *   NEXT_PUBLIC_LIVE_URL=http://localhost:8099 npm run dev
 *   open http://localhost:3000/live/11377
 */
export default function LiveSessionPage() {
  const params = useParams()
  const router = useRouter()
  const sessionKey = Number(params.sessionKey)

  const { snapshot, connection, frameAge, error, proRequired, followingSession, reconnect } = useLiveSession(
    Number.isNaN(sessionKey) ? null : sessionKey,
  )

  // An old link (yesterday's practice) while the server follows today's
  // session: go to what is actually live rather than showing a refusal.
  useEffect(() => {
    if (followingSession != null && followingSession !== sessionKey) router.replace(`/live/${followingSession}`)
  }, [followingSession, sessionKey, router])

  useEffect(() => {
    document.title = `Live · session ${sessionKey} · ${PRODUCT_NAME}`
    return () => {
      document.title = `${PRODUCT_NAME} — Race Strategy Intelligence`
    }
  }, [sessionKey])

  if (Number.isNaN(sessionKey)) {
    router.push('/')
    return null
  }

  // Not an error screen: the session exists and is running, it is behind the
  // wall. Same component and same exchange as a PRO race, so a shared live link
  // unlocks where it was opened.
  if (proRequired) {
    return (
      <AppShell breadcrumb={[{ label: 'Live', href: '/' }]}>
        <div className="min-h-[calc(100vh-48px)] flex items-center justify-center px-6">
          <ProWall year={new Date().getFullYear()} onUnlocked={() => reconnect()} />
        </div>
      </AppShell>
    )
  }

  const breadcrumb = [{ label: 'Live', href: '/' }, { label: `Session ${sessionKey}` }]

  return (
    <AppShell breadcrumb={breadcrumb}>
      {!snapshot ? (
        <div className="max-w-[1440px] mx-auto px-4 py-4 space-y-3">
          <div className="bg-bg-panel border border-border-subtle px-4 py-3 flex items-center justify-between flex-wrap gap-3">
            <div className="font-display font-black text-[20px] uppercase tracking-[-0.5px] text-text-primary">Live timing</div>
            <ConnectionBanner connection={connection} feed={null} frameAge={frameAge} generatedAt={null} error={error} onRetry={reconnect} />
          </div>
          <WaitingForFeed error={error} />
        </div>
      ) : snapshot.session_key == null ? (
        <NotLiveYet />
      ) : (
        <DashboardBoundary fallback={<ClassicView snapshot={snapshot} />}>
          <LiveDashboard snapshot={snapshot} connection={connection} frameAge={frameAge} error={error} onRetry={reconnect} />
        </DashboardBoundary>
      )}
    </AppShell>
  )
}

function WaitingForFeed({ error }: { error: string | null }) {
  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] p-8 text-center">
      <div className="font-display font-bold text-[10px] uppercase tracking-[1.5px] text-text-muted mb-2">
        {error ? 'No live feed' : 'Connecting'}
      </div>
      <p className="font-mono text-[11px] text-text-secondary leading-relaxed max-w-lg mx-auto">
        {error ??
          'Waiting for the first snapshot from the live server. Nothing is shown until real data arrives — an empty tower is honest, a placeholder one is not.'}
      </p>
    </div>
  )
}

/**
 * If the dashboard throws on a payload nobody has seen yet, the session must
 * still be watchable: fall back to the previous, simpler view rather than a
 * blank page in the middle of a race. The next frame retries the dashboard.
 */
class DashboardBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failedAt: number | null }> {
  state = { failedAt: null as number | null }
  static getDerivedStateFromError() {
    return { failedAt: Date.now() }
  }
  componentDidCatch(err: unknown) {
    console.error('[live] dashboard failed, showing the classic view', err)
    setTimeout(() => this.setState({ failedAt: null }), 30_000)
  }
  render() {
    return this.state.failedAt != null ? this.props.fallback : this.props.children
  }
}

function ClassicView({ snapshot }: { snapshot: LiveSnapshot }) {
  return (
    <div className="max-w-[1440px] mx-auto px-4 py-4 space-y-3">
      {snapshot.profile === 'practice' || snapshot.profile === 'qualifying'
        ? <PracticePitWall snapshot={snapshot} focusedDriver={null} onFocus={() => undefined} />
        : <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PositionTower rows={snapshot.tower} focusedDriver={null} onFocus={() => undefined} />
            <LiveEngineerNotes notes={snapshot.notes} />
          </div>}
    </div>
  )
}
