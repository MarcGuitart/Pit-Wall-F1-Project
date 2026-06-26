'use client'

import { useEffect, useState } from 'react'
import type { ErrorCode } from '@/lib/errors'

type SessionUnavailableStateProps = {
  code: ErrorCode
  message: string
  unlockAtUtc?: string
  retryAfterMinutes?: number
  onRetry: () => void
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
}: SessionUnavailableStateProps) {
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
