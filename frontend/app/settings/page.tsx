'use client'

/**
 * Settings — where PRO access is actually managed.
 *
 * The code field and the "access active" state used to live in a banner on
 * the home page (Block 14). Block 20 moves that whole exchange here: the home
 * page's PRO section is informational only now, and every page's TopBar shows
 * a small badge that links back to this one place.
 */
import { useState, useRef, useEffect } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { useAccessStore } from '@/stores/accessStore'
import { redeemAccessCode } from '@/lib/api'
import { formatExpiry } from '@/lib/format'
import { ApiError } from '@/lib/errors'

const REDEEM_ERROR: Record<string, string> = {
  INVALID_ACCESS_CODE: 'That code is not valid.',
  RATE_LIMITED: 'Too many attempts. Wait a few minutes and try again.',
  PRO_ACCESS_UNAVAILABLE: 'Access codes are not switched on yet.',
}

export default function SettingsPage() {
  const pro = useAccessStore((s) => s.pro)
  const expiresAt = useAccessStore((s) => s.expiresAt)
  const checked = useAccessStore((s) => s.checked)
  const showBadge = useAccessStore((s) => s.showBadge)
  const setShowBadge = useAccessStore((s) => s.setShowBadge)
  const signOut = useAccessStore((s) => s.signOut)

  // Only meaningful without a token: turning the toggle on with no PRO access
  // yet is what reveals the code field. With a token, the toggle instead
  // controls showBadge directly (see the handler below) and this stays false.
  const [showCodeField, setShowCodeField] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showCodeField) inputRef.current?.focus()
  }, [showCodeField])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = code.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await redeemAccessCode(trimmed)
      setCode('')
      setShowCodeField(false)
      // useAccessStore updates itself: redeemAccessCode() fires
      // ACCESS_CHANGED_EVENT, which AccessBootstrap (mounted in the root
      // layout) is already listening for.
    } catch (err) {
      const apiCode = err instanceof ApiError ? err.code : ''
      setError(REDEEM_ERROR[apiCode] ?? 'Could not check that code. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleToggle() {
    if (pro) {
      // Display preference only — the token is untouched either way. Made
      // explicit in the copy below the toggle, since this is exactly the kind
      // of control that looks like it should log you out and does not.
      setShowBadge(!showBadge)
      return
    }
    // No token: the toggle's only job is to open the field that gets one.
    setShowCodeField((v) => !v)
  }

  // With a token, the toggle reflects the display preference (showBadge);
  // without one, it reflects whether the code field is open.
  const toggleOn = pro ? showBadge : showCodeField
  const until = formatExpiry(expiresAt)

  return (
    <AppShell breadcrumb={[{ label: 'Settings' }]}>
      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="font-display font-black text-[28px] uppercase tracking-[-0.5px] text-text-primary mb-1">
          Settings
        </h1>
        <p className="font-mono text-[11px] text-text-muted mb-8">
          Preferences for this browser only.
        </p>

        <section
          className="bg-bg-panel border border-border-default rounded-[4px] p-6"
          aria-labelledby="pro-access-heading"
        >
          <div className="flex items-start justify-between gap-6 flex-wrap mb-5">
            <div>
              <h2
                id="pro-access-heading"
                className="font-display font-bold text-[14px] uppercase tracking-[0.5px] text-text-primary"
              >
                PRO access
              </h2>
              <p className="font-mono text-[10px] text-text-muted mt-1 max-w-sm leading-relaxed">
                {pro
                  ? 'A valid access code is active on this browser.'
                  : 'Races from 2025, the current season and Live mode.'}
              </p>
            </div>

            {/* Toggle */}
            <button
              type="button"
              role="switch"
              aria-checked={toggleOn}
              onClick={handleToggle}
              className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
                toggleOn ? 'bg-signal-green' : 'bg-bg-elevated border border-border-default'
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  toggleOn ? 'translate-x-[18px]' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {pro ? (
            <div className="border-t border-border-subtle pt-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-signal-green" aria-hidden="true" />
                <span className="font-display font-bold text-[10px] uppercase tracking-[1.5px] text-signal-green">
                  PRO access active
                </span>
              </div>
              <p className="font-mono text-[10px] text-text-muted mb-4">
                {checked && until
                  ? `Valid until ${until}.`
                  : checked
                    ? 'Valid on this browser.'
                    : 'Confirming with the server…'}
              </p>

              <p className="font-mono text-[9px] text-text-muted mb-4 leading-relaxed max-w-sm">
                {showBadge
                  ? 'The toggle above only controls the PRO badge in the top bar — it is a display preference for this browser, not your access. Turning it off does not sign you out.'
                  : 'The PRO badge is hidden in the top bar. Your access code is still active — this only changed what is displayed.'}
              </p>

              <button
                type="button"
                onClick={signOut}
                className="font-mono text-[10px] text-text-muted hover:text-signal-red transition-colors underline underline-offset-4 decoration-border-default"
              >
                Sign out of PRO
              </button>
            </div>
          ) : (
            <div className="border-t border-border-subtle pt-4">
              {!showCodeField ? (
                <p className="font-mono text-[10px] text-text-muted">
                  Turn this on to enter an access code.
                </p>
              ) : (
                <>
                  <form onSubmit={submit} className="flex flex-wrap items-start gap-2">
                    <div className="flex-1 min-w-[220px]">
                      <label
                        htmlFor="settings-pro-code"
                        className="block font-display font-bold text-[9px] uppercase tracking-[1.5px] text-text-muted mb-1.5"
                      >
                        Access code
                      </label>
                      <input
                        ref={inputRef}
                        id="settings-pro-code"
                        type="text"
                        value={code}
                        onChange={(e) => { setCode(e.target.value); setError(null) }}
                        placeholder="PW-…"
                        autoComplete="off"
                        spellCheck={false}
                        aria-invalid={error !== null}
                        aria-describedby={error ? 'settings-pro-code-error' : undefined}
                        className="w-full bg-bg-primary border border-border-default rounded-[3px] px-3 py-2
                                   font-mono text-[12px] text-text-primary placeholder:text-text-muted
                                   focus:outline-none focus:border-signal-blue transition-colors"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submitting || code.trim().length === 0}
                      className="mt-[22px] px-4 py-2 rounded-[3px] border border-signal-red bg-signal-red/10
                                 font-display font-bold text-[10px] uppercase tracking-[1.5px] text-signal-red
                                 hover:bg-signal-red/20 disabled:opacity-40 disabled:hover:bg-signal-red/10
                                 disabled:cursor-not-allowed transition-colors"
                    >
                      {submitting ? 'Checking…' : 'Unlock'}
                    </button>
                  </form>
                  <p
                    id="settings-pro-code-error"
                    role="status"
                    aria-live="polite"
                    className={`font-mono text-[10px] mt-2 ${error ? 'text-signal-red' : 'sr-only'}`}
                  >
                    {error ?? ''}
                  </p>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  )
}
