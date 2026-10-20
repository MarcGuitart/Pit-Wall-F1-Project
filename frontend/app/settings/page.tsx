'use client'

/**
 * Settings — where PRO access is actually managed.
 *
 * The code field and the "access active" state used to live in a banner on
 * the home page (Block 14). Block 20 moves that whole exchange here: the home
 * page's PRO section is informational only now, and every page's TopBar shows
 * a small badge that links back to this one place.
 */
import { useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { useAccessStore } from '@/stores/accessStore'
import { formatExpiry } from '@/lib/format'
import { Badge, PageContainer, PageHeader } from '@/components/ui'
import { AccessCodeForm } from '@/components/access/AccessCodeForm'
import pg from '@/components/layout/page.module.css'

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
      <PageContainer width="narrow">
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
                  ? 'The toggle above only controls the PRO badge in the top bar: it is a display preference for this browser, not your access. Turning it off does not sign you out.'
                  : 'The PRO badge is hidden in the top bar. Your access code is still active. This only changed what is displayed.'}
              </p>

              <button type="button" onClick={signOut} className={pg.linkBtn}>Sign out of PRO</button>
            </div>
          ) : (
            <div className={pg.cardBody}>
              {!showCodeField ? (
                <p className={pg.small}>Turn this on to enter an access code.</p>
              ) : (
                <AccessCodeForm id="settings-pro-code" autoFocus onRedeemed={() => setShowCodeField(false)} />
              )}
            </div>
          )}
        </section>
      </div>
      </PageContainer>
    </AppShell>
  )
}
