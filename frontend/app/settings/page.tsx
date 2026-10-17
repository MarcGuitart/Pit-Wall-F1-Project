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
import { Badge, PageHeader, buttonClass, ui } from '@/components/ui'
import pg from '@/components/layout/page.module.css'

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
      <PageHeader kicker="This browser" title="Settings" meta={<span>Preferences for this browser only.</span>} />
      <div className={pg.page}>
        <section className={pg.card} aria-labelledby="pro-access-heading">
          <div className={pg.cardHead}>
            <div>
              <h2 id="pro-access-heading" className={pg.h2}>PRO access</h2>
              <p className={pg.small} style={{ marginTop: 6 }}>
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
              aria-labelledby="pro-access-heading"
              onClick={handleToggle}
              className={`${pg.switch} ${toggleOn ? pg.switchOn : ''}`}
            >
              <span aria-hidden="true" />
            </button>
          </div>

          {pro ? (
            <div className={pg.cardBody}>
              <div><Badge tone="accent" solid>PRO access active</Badge></div>
              <p className={pg.small}>
                {checked && until
                  ? `Valid until ${until}.`
                  : checked
                    ? 'Valid on this browser.'
                    : 'Confirming with the server…'}
              </p>

              <p className={pg.small}>
                {showBadge
                  ? 'The toggle above only controls the PRO badge in the top bar — it is a display preference for this browser, not your access. Turning it off does not sign you out.'
                  : 'The PRO badge is hidden in the top bar. Your access code is still active — this only changed what is displayed.'}
              </p>

              <button type="button" onClick={signOut} className={pg.linkBtn}>Sign out of PRO</button>
            </div>
          ) : (
            <div className={pg.cardBody}>
              {!showCodeField ? (
                <p className={pg.small}>Turn this on to enter an access code.</p>
              ) : (
                <>
                  <form onSubmit={submit} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 220, display: 'grid', gap: 6 }}>
                      <label htmlFor="settings-pro-code" className={ui.label}>Access code</label>
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
                        className={ui.input}
                      />
                    </div>
                    <button type="submit" disabled={submitting || code.trim().length === 0} className={buttonClass('primary', true)}>
                      {submitting ? 'Checking…' : 'Unlock'}
                    </button>
                  </form>
                  <p
                    id="settings-pro-code-error"
                    role="status"
                    aria-live="polite"
                    className={error ? ui.accent : ui.srOnly}
                    style={{ margin: 0, fontSize: 13 }}
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
