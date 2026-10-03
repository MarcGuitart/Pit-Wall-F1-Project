'use client'

import Link from 'next/link'
import s from '@/components/live/dashboard/live.module.css'
import { PreviewShell } from '@/components/preview/PreviewShell'
import { LiveDashboard } from '@/components/live/dashboard/LiveDashboard'
import { NotLiveYet } from '@/components/live/dashboard/NotLiveYet'
import { useLiveSession } from '@/hooks/useLiveSession'
import { useLiveStatus } from '@/hooks/useLiveStatus'
import { useAccessStore } from '@/stores/accessStore'

/** Live mode inside the redesign's chrome — the same dashboard, whatever is running now. */
export default function PreviewLive() {
  const pro = useAccessStore(st => st.pro)
  const { liveSessionKey, liveChecked } = useLiveStatus(pro, new Date().getFullYear())
  return (
    <PreviewShell active="live">
      {!pro ? (
        <div className={s.empty} style={{ padding: 48, fontSize: 15 }}>
          Live mode is part of PRO. <Link href="/preview/settings" style={{ color: 'var(--pw-accent-text)' }}>Enter an access code →</Link>
        </div>
      ) : liveSessionKey == null ? (
        liveChecked ? <NotLiveYet /> : <div className={s.empty} style={{ padding: 48 }}>Checking the live server…</div>
      ) : <Live sessionKey={liveSessionKey} />}
    </PreviewShell>
  )
}

function Live({ sessionKey }: { sessionKey: number }) {
  const { snapshot, connection, frameAge, error, reconnect } = useLiveSession(sessionKey)
  if (!snapshot) return <div className={s.empty} style={{ padding: 48 }}>{error ?? 'Connecting to the live server…'}</div>
  if (snapshot.session_key == null) return <NotLiveYet />
  return <LiveDashboard snapshot={snapshot} connection={connection} frameAge={frameAge} error={error} onRetry={reconnect} />
}
