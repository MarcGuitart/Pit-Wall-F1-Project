'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { ErrorCode } from '@/lib/errors'
import { NotifyButton } from '@/components/notify/NotifyButton'
import { fetchLiveServerStatus } from '@/lib/liveStatus'

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
    accentColor: 'bg-signal-amber',
    icon: '○',
    title: 'SESSION STILL IN LIVE WINDOW',
  },
  SESSION_NOT_CACHED: {
    accentColor: 'bg-signal-blue',
    icon: '○',
    title: 'NOT IN DEMO CACHE',
  },
  OPENF1_RATE_LIMIT: {
    accentColor: 'bg-signal-amber',
    icon: '⏸',
    title: 'OPENF1 RATE LIMIT',
  },
  OPENF1_ERROR: {
    accentColor: 'bg-signal-red',
    icon: '⚠',
    title: 'DATA UNAVAILABLE',
  },
  ANALYSIS_FAILED: {
    accentColor: 'bg-signal-red',
    icon: '⚠',
    title: 'ANALYSIS INCOMPLETE',
  },
  UNKNOWN: {
    accentColor: 'bg-signal-red',
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
    <div className="bg-bg-panel border border-border-default rounded-[4px] overflow-hidden max-w-lg w-full">
      {/* Accent bar */}
      <div className={`h-[2px] w-full ${cfg.accentColor}`} />

      <div className="px-6 py-8">
        {/* Icon */}
        <div className="font-display text-[32px] text-text-muted mb-4 select-none">
          {cfg.icon}
        </div>

        {/* Title */}
        <h2 className="font-display font-black text-[16px] uppercase tracking-[1.5px] text-text-primary mb-3">
          {cfg.title}
        </h2>

        {/* Message */}
        <p
          className="font-mono text-[12px] text-text-secondary leading-relaxed mb-4"
        >
          {message}
        </p>

        {/* Unlock time */}
        {localTime && (
          <p className="font-mono text-[11px] text-signal-amber mb-4">
            Approximately available at {localTime} (local time)
          </p>
        )}

        {/* Retry countdown */}
        {countdown > 0 && (
          <p className="font-mono text-[11px] text-text-muted mb-4">
            Auto-retry in {countdown}s
          </p>
        )}

        {code === 'SESSION_NOT_HISTORICAL_YET' && sessionKey != null && (
          <div className="mb-5 space-y-4">
            {liveHere && (
              <Link
                href={`/live/${sessionKey}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-signal-red text-white font-display font-bold text-[11px] uppercase tracking-[1px] rounded-[3px] hover:bg-red-600"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" aria-hidden="true" />
                It is live now — open the pit wall
              </Link>
            )}
            <NotifyButton
              label="Notify me when the analysis is ready"
              watch={{ kind: 'analysis', id: `analysis-${sessionKey}`, label: `Session ${sessionKey}`, sessionKey, readyAt: unlockAtUtc ?? null }}
              className="px-4 py-2 bg-bg-elevated border border-signal-amber/40 text-signal-amber font-display font-bold text-[10px] uppercase tracking-[1px] rounded-[3px] hover:border-signal-amber"
            />
          </div>
        )}

        {/* Button */}
        <button
          onClick={() => {
            setCountdown(0)
            onRetry()
          }}
          className="px-4 py-2 bg-bg-elevated border border-border-default text-text-secondary font-display font-bold text-[10px] uppercase tracking-[1px] rounded-[3px] hover:text-text-primary hover:border-text-muted transition-colors"
        >
          Check again
        </button>
      </div>
    </div>
  )
}
