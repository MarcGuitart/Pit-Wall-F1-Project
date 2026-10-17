'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { ErrorCode } from '@/lib/errors'
import { NotifyButton } from '@/components/notify/NotifyButton'
import { fetchLiveServerStatus } from '@/lib/liveStatus'
import { buttonClass, ui } from '@/components/ui'
import st from './states.module.css'

type SessionUnavailableStateProps = {
  code: ErrorCode
  message: string
  unlockAtUtc?: string
  retryAfterMinutes?: number
  onRetry: () => void
  /** Set by the race page: lets the live-window state offer the live pit wall and a notification. */
  sessionKey?: number
}

const CONFIG: Record<
  string,
  { accentColor: string; icon: string; title: string }
> = {
  SESSION_NOT_HISTORICAL_YET: {
    accentColor: 'var(--pw-amber)',
    icon: '○',
    title: 'SESSION STILL IN LIVE WINDOW',
  },
  SESSION_NOT_CACHED: {
    accentColor: 'var(--pw-blue)',
    icon: '○',
    title: 'NOT IN DEMO CACHE',
  },
  OPENF1_RATE_LIMIT: {
    accentColor: 'var(--pw-amber)',
    icon: '⏸',
    title: 'OPENF1 RATE LIMIT',
  },
  OPENF1_ERROR: {
    accentColor: 'var(--pw-accent)',
    icon: '⚠',
    title: 'DATA UNAVAILABLE',
  },
  ANALYSIS_FAILED: {
    accentColor: 'var(--pw-accent)',
    icon: '⚠',
    title: 'ANALYSIS INCOMPLETE',
  },
  UNKNOWN: {
    accentColor: 'var(--pw-accent)',
    icon: '⚠',
    title: 'ERROR',
  },
}

export function SessionUnavailableState({
  code,
  message,
  unlockAtUtc,
  retryAfterMinutes,
  onRetry,
  sessionKey,
}: SessionUnavailableStateProps) {
  // A session in OpenF1's live window may be the one running right now:
  // if the live server is following it, the useful answer is "watch it live".
  const [liveHere, setLiveHere] = useState(false)
  useEffect(() => {
    if (code !== 'SESSION_NOT_HISTORICAL_YET' || sessionKey == null) return
    fetchLiveServerStatus().then(st => setLiveHere(st.reachable && st.sessionKey === sessionKey)).catch(() => undefined)
  }, [code, sessionKey])
  const cfg = CONFIG[code] ?? CONFIG.UNKNOWN
  const [countdown, setCountdown] = useState<number>(
    retryAfterMinutes && retryAfterMinutes > 0 ? 30 : 0,
  )

  // 30-second auto-retry countdown
  useEffect(() => {
    if (countdown <= 0) return
    const id = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(id)
          onRetry()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [countdown, onRetry])

  const localTime = unlockAtUtc
    ? new Date(unlockAtUtc).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <section className={st.card} style={{ boxShadow: `inset 0 4px 0 ${cfg.accentColor}` }} aria-labelledby="unavailable-title">
      {/* Icon */}
      <div className={st.icon} aria-hidden="true">{cfg.icon}</div>

      {/* Title */}
      <h2 id="unavailable-title" className={st.title}>{cfg.title}</h2>

      {/* Message */}
      <p className={st.message}>{message}</p>

      {/* Unlock time */}
      {localTime && (
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--pw-amber)' }}>
          Approximately available at {localTime} (local time)
        </p>
      )}

      {/* Retry countdown */}
      {countdown > 0 && (
        <p className={ui.sub} style={{ margin: 0 }} role="status">Auto-retry in {countdown}s</p>
      )}

      {code === 'SESSION_NOT_HISTORICAL_YET' && sessionKey != null && (
        <div style={{ display: 'grid', gap: 14 }}>
          {liveHere && (
            <Link href={`/live/${sessionKey}`} className={buttonClass('primary', true)} style={{ justifySelf: 'start' }}>
              It is live now — open the pit wall
            </Link>
          )}
          <NotifyButton
            label="Notify me when the analysis is ready"
            watch={{ kind: 'analysis', id: `analysis-${sessionKey}`, label: `Session ${sessionKey}`, sessionKey, readyAt: unlockAtUtc ?? null }}
            className={buttonClass('ink')}
          />
        </div>
      )}

      {/* Button */}
      <div>
        <button
          type="button"
          onClick={() => {
            setCountdown(0)
            onRetry()
          }}
          className={buttonClass('ink')}
        >
          Check again
        </button>
      </div>
    </section>
  )
}
