'use client'

/**
 * What a PRO race shows instead of an analysis.
 *
 * Reached when the backend answers PRO_REQUIRED — including when someone opens
 * /race/<key> directly, which is exactly how a PRO race was reachable before
 * this existed. It is not an error screen: nothing has gone wrong, so it does
 * not offer "Retry", and it does not say "failed".
 *
 * The code field here is the same exchange as the landing page's, so whoever
 * arrives by a shared link can unlock without being sent somewhere else first.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { redeemAccessCode } from '@/lib/api'
import { PRO_PRICE_LABEL } from '@/lib/access'
import { ApiError } from '@/lib/errors'

const REDEEM_ERROR: Record<string, string> = {
  INVALID_ACCESS_CODE: 'That code is not valid.',
  RATE_LIMITED: 'Too many attempts. Wait a few minutes and try again.',
  PRO_ACCESS_UNAVAILABLE: 'Access codes are not switched on yet.',
}

export function ProWall({ year, onUnlocked }: { year?: number | null; onUnlocked: () => void }) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = code.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await redeemAccessCode(trimmed)
      onUnlocked()
    } catch (err) {
      const apiCode = err instanceof ApiError ? err.code : ''
      setError(REDEEM_ERROR[apiCode] ?? 'Could not check that code. Try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-bg-panel border border-border-default rounded-[4px] max-w-lg w-full overflow-hidden">
      {/* hazard strip: the pit lane is closed, not broken */}
      <div
        className="h-1.5"
        style={{
          backgroundImage: 'repeating-linear-gradient(45deg, #FFB020 0 8px, #05060A 8px 16px)',
        }}
        aria-hidden="true"
      />
      <div className="p-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-signal-amber" aria-hidden="true" />
          <span className="font-display font-bold text-[9px] uppercase tracking-[2px] text-signal-amber">
            Restricted — Pit Wall PRO
          </span>
        </div>

        <h1 className="font-display font-black text-[30px] leading-[0.95] uppercase tracking-[-0.5px] text-text-primary mb-3">
          {year ? `The ${year} season` : 'This season'} is PRO
        </h1>

        <p className="font-body text-[14px] text-text-secondary leading-relaxed mb-1">
          2023 and 2024 are free to read. {PRO_PRICE_LABEL}.
        </p>
        <p className="font-mono text-[10px] text-text-muted mb-6">
          Subscriptions are not open yet — €2.99/month is what it will cost.
        </p>

        <form onSubmit={submit} className="flex flex-wrap items-end gap-2 mb-2">
          <div className="flex-1 min-w-[200px]">
            <label
              htmlFor="wall-code"
              className="block font-display font-bold text-[9px] uppercase tracking-[1.5px] text-text-muted mb-1.5"
            >
              Access code
            </label>
            <input
              id="wall-code"
              type="text"
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(null) }}
              placeholder="PW-…"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={error !== null}
              aria-describedby={error ? 'wall-code-error' : undefined}
              className="w-full bg-bg-primary border border-border-default rounded-[3px] px-3 py-2
                         font-mono text-[12px] text-text-primary placeholder:text-text-muted
                         focus:outline-none focus:border-signal-blue transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || code.trim().length === 0}
            className="px-4 py-2 rounded-[3px] border border-signal-red bg-signal-red/10
                       font-display font-bold text-[10px] uppercase tracking-[1.5px] text-signal-red
                       hover:bg-signal-red/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Checking…' : 'Unlock'}
          </button>
        </form>

        <p
          id="wall-code-error"
          role="status"
          aria-live="polite"
          className={`font-mono text-[10px] mb-5 ${error ? 'text-signal-red' : 'sr-only'}`}
        >
          {error ?? ''}
        </p>

        <button
          type="button"
          onClick={() => router.push('/')}
          className="font-mono text-[11px] text-text-muted hover:text-text-primary transition-colors underline underline-offset-4 decoration-border-default"
        >
          Back to the free seasons
        </button>
      </div>
    </div>
  )
}
