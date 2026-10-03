'use client'

import { useState } from 'react'
import s from '@/components/live/dashboard/live.module.css'
import { PreviewShell } from '@/components/preview/PreviewShell'
import { ThemeToggle } from '@/components/live/dashboard/ThemeToggle'
import { useAccessStore } from '@/stores/accessStore'
import { redeemAccessCode } from '@/lib/api'
import { formatExpiry } from '@/lib/format'
import { ApiError } from '@/lib/errors'
import { usePwTheme } from '@/lib/pwTheme'

const REDEEM_ERROR: Record<string, string> = {
  INVALID_ACCESS_CODE: 'That code is not valid.',
  RATE_LIMITED: 'Too many attempts. Wait a few minutes and try again.',
  PRO_ACCESS_UNAVAILABLE: 'Access codes are not switched on yet.',
}

/** Settings in the redesign — same store, same exchange as /settings. */
export default function PreviewSettings() {
  const pro = useAccessStore(st => st.pro)
  const expiresAt = useAccessStore(st => st.expiresAt)
  const showBadge = useAccessStore(st => st.showBadge)
  const setShowBadge = useAccessStore(st => st.setShowBadge)
  const signOut = useAccessStore(st => st.signOut)
  const [theme, setTheme] = usePwTheme()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await redeemAccessCode(code.trim())
      setCode('')
    } catch (err) {
      setError(REDEEM_ERROR[err instanceof ApiError ? err.code : ''] ?? 'Could not check that code. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const row = (label: string, sub: string, control: React.ReactNode) => (
    <div className={s.cell} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 20, alignItems: 'center', padding: '22px 32px' }}>
      <div><div style={{ fontSize: 18, fontWeight: 800 }}>{label}</div><div className={s.sub} style={{ fontSize: 13, marginTop: 4 }}>{sub}</div></div>
      {control}
    </div>
  )

  return (
    <PreviewShell active="settings">
      <header className={s.header}>
        <div><div className={s.kicker}><span className={s.square} />Preferences for this browser only</div><h1 className={s.h1}>Settings</h1></div>
      </header>
      <div className={s.cells} style={{ gridTemplateColumns: '1fr', borderTop: '2px solid var(--pw-divider)', borderBottom: '2px solid var(--pw-divider)' }}>
        {row('PRO access', pro ? `Active${formatExpiry(expiresAt) ? ` · valid until ${formatExpiry(expiresAt)}` : ''}.` : 'Races from 2025, the current season and Live mode.',
          pro
            ? <button className={s.btn} onClick={signOut}>Sign out of PRO</button>
            : (
              <form onSubmit={submit} style={{ display: 'flex', gap: 0 }}>
                <input value={code} onChange={e => { setCode(e.target.value); setError(null) }} placeholder="PW-…" aria-label="Access code" autoComplete="off" spellCheck={false}
                  style={{ font: 'inherit', fontSize: 14, padding: '8px 12px', background: 'var(--pw-surface)', color: 'var(--pw-text)', border: '2px solid var(--pw-divider)', borderRight: 0, outline: 'none', width: 200 }} />
                <button type="submit" disabled={busy || !code.trim()} className={`${s.segOpt} ${s.segOn}`} style={{ cursor: 'pointer', fontWeight: 800, opacity: busy || !code.trim() ? 0.5 : 1 }}>{busy ? 'Checking…' : 'Unlock'}</button>
              </form>
            ))}
        {pro && row('PRO badge', 'Shown in the top bar. A display preference — hiding it does not sign you out.',
          <div className={s.seg}>
            <button className={`${s.segOpt} ${s.segBtn} ${showBadge ? s.segOn : ''}`} onClick={() => setShowBadge(true)} aria-pressed={showBadge}>Shown</button>
            <button className={`${s.segOpt} ${s.segBtn} ${!showBadge ? s.segOn : ''}`} onClick={() => setShowBadge(false)} aria-pressed={!showBadge}>Hidden</button>
          </div>)}
        {row('Ground', 'Light paper or the dark pit wall. Applies to the live page and this preview.', <ThemeToggle theme={theme} onChange={setTheme} />)}
      </div>
      {error && <div className={s.empty} style={{ color: 'var(--pw-accent-text)' }}>{error}</div>}
    </PreviewShell>
  )
}
