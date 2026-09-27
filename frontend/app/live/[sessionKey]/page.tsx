'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { useLiveSession } from '@/hooks/useLiveSession'
import { ConnectionBanner } from '@/components/live/ConnectionBanner'
import { TrackStatusBanner } from '@/components/live/TrackStatusBanner'
import { PositionTower } from '@/components/live/PositionTower'
import { ChaosDensityMeter } from '@/components/live/ChaosDensityMeter'
import { PitWindowWatch } from '@/components/live/PitWindowWatch'
import { PitCyclesLive } from '@/components/live/PitCyclesLive'
import { LiveEngineerNotes } from '@/components/live/LiveEngineerNotes'
import { RadioFeed } from '@/components/live/RadioFeed'
import { ProWall } from '@/components/access/ProWall'

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

  const { snapshot, connection, frameAge, error, proRequired, reconnect } = useLiveSession(
    Number.isNaN(sessionKey) ? null : sessionKey,
  )
  const [focusedDriver, setFocusedDriver] = useState<string | null>(null)

  useEffect(() => {
    document.title = `Live · session ${sessionKey} · Pit Wall IQ`
    return () => {
      document.title = 'Pit Wall IQ — Race Strategy Intelligence'
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
  const pit = snapshot?.analysis?.pit

  return (
    <AppShell breadcrumb={breadcrumb}>
      <div className="max-w-[1400px] mx-auto px-4 py-4 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display font-black text-[22px] uppercase tracking-[1px] text-text-primary leading-none">
              Live pit wall
            </h1>
            <p className="font-mono text-[10px] text-text-muted mt-1">
              Session {sessionKey}
              {snapshot?.feed.mode === 'replay' && ' · replaying a recorded capture'}
            </p>
          </div>
          <ConnectionBanner
            connection={connection}
            feed={snapshot?.feed ?? null}
            frameAge={frameAge}
            generatedAt={snapshot?.generated_at ?? null}
            error={error}
            onRetry={reconnect}
          />
        </div>

        {!snapshot ? (
          <WaitingForFeed error={error} />
        ) : (
          <>
            <TrackStatusBanner
              status={snapshot.track_status}
              currentLap={snapshot.current_lap}
              raceDistance={snapshot.race_distance}
              raceDistanceSource={snapshot.race_distance_source}
              chequered={snapshot.chequered}
            />

            {focusedDriver && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-panel border border-border-subtle rounded-[3px]">
                <span className="font-display font-bold text-[9px] uppercase tracking-[1.5px] text-text-muted">
                  Focused
                </span>
                <span className="font-display font-bold text-[12px] text-text-primary">
                  {focusedDriver}
                </span>
                <button
                  onClick={() => setFocusedDriver(null)}
                  className="ml-auto font-mono text-[10px] text-text-secondary hover:text-text-primary"
                >
                  clear
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-4 items-start">
              <div className="space-y-4">
                <PositionTower
                  rows={snapshot.tower}
                  focusedDriver={focusedDriver}
                  onFocus={setFocusedDriver}
                />
                <PitCyclesLive
                  cycles={pit?.cycles ?? []}
                  settleLaps={pit?.settle_laps ?? 2}
                  currentLap={snapshot.current_lap}
                />
                <RadioFeed clips={snapshot.radio} focusedDriver={focusedDriver} />
              </div>

              <div className="space-y-4">
                <LiveEngineerNotes notes={snapshot.notes} />
                <PitWindowWatch signals={snapshot.pit_watch} focusedDriver={focusedDriver} />
                <ChaosDensityMeter chaos={snapshot.chaos} />
              </div>
            </div>

            <FeedFooter snapshot={snapshot} />
          </>
        )}
      </div>
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

function FeedFooter({ snapshot }: { snapshot: NonNullable<ReturnType<typeof useLiveSession>['snapshot']> }) {
  const gaps = snapshot.feed.gaps_observed
  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] px-3 py-2.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="font-display font-bold text-[9px] uppercase tracking-[1.5px] text-text-muted">
          Feed
        </span>
        <span className="font-mono text-[10px] text-text-muted">
          {snapshot.feed.messages_total.toLocaleString()} messages ·{' '}
          {Object.entries(snapshot.feed.documents)
            .filter(([, n]) => n > 0)
            .map(([topic, n]) => `${topic} ${n}`)
            .join(' · ')}
        </span>
      </div>
      {gaps.length > 0 && (
        <p className="font-mono text-[9px] text-text-muted leading-relaxed mt-1.5">
          Gaps in the feed this session:{' '}
          {gaps.map((g) => `${g.seconds}s at L${g.at_lap}`).join(', ')}. Laps spanning a gap are
          missing intervals; the order is carried forward from the last message.
        </p>
      )}
    </div>
  )
}
