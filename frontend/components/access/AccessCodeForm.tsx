'use client'

import { useEffect, useRef, useState } from 'react'
import { redeemAccessCode } from '@/lib/api'
import { ApiError } from '@/lib/errors'
import { REDEEM_ERROR } from '@/components/access/ProWall'
import { buttonClass, ui } from '@/components/ui'

/**
 * The access-code field (Block 20's, from Settings), shared by Settings and
 * the landing's plans. A redeemed code updates the access store on its own:
 * redeemAccessCode() announces the change and AccessBootstrap listens.
 */
export function AccessCodeForm({ id, autoFocus = false, onRedeemed }: { id: string; autoFocus?: boolean; onRedeemed?: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFocus) inputRef.current?.focus() }, [autoFocus])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = code.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await redeemAccessCode(trimmed)
      setCode('')
      onRedeemed?.()
    } catch (err) {
      const apiCode = err instanceof ApiError ? err.code : ''
      setError(REDEEM_ERROR[apiCode] ?? 'Could not check that code. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <form onSubmit={submit} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 220, display: 'grid', gap: 6 }}>
          <label htmlFor={id} className={ui.label}>Access code</label>
          <input
            ref={inputRef}
            id={id}
            type="text"
            value={code}
            onChange={(e) => { setCode(e.target.value); setError(null) }}
            placeholder="PW-…"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error !== null}
            aria-describedby={error ? `${id}-error` : undefined}
            className={ui.input}
          />
        </div>
        <button type="submit" disabled={submitting || code.trim().length === 0} className={buttonClass('primary', true)}>
          {submitting ? 'Checking…' : 'Unlock'}
        </button>
      </form>
      <p id={`${id}-error`} role="status" aria-live="polite" className={error ? ui.accent : ui.srOnly} style={{ margin: 0, fontSize: 13 }}>
        {error ?? ''}
      </p>
    </>
  )
}
