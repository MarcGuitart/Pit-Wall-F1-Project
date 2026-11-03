'use client'

import { useEffect, useState } from 'react'
import { redeemAccessCode } from '@/lib/api'
import { ApiError } from '@/lib/errors'
import { useAccessStore } from '@/stores/accessStore'
import { promoLanguage, remainingText, usePromo, type Lang } from '@/lib/promo'
import { buttonClass, ui } from '@/components/ui'
import s from './openWeekBanner.module.css'

/**
 * The public promo code (lib/promo.ts), with its countdown and a field to redeem it right here. Fixed to the
 * bottom of the viewport, so appearing once the API answers moves nothing on the page. Shown only while the promo
 * runs and this browser holds no PRO token; closed for the rest of the session with ×, per code, so a new promo
 * shows again. English, or Spanish for a browser that asks for it.
 */
export const DISMISS_KEY = 'pw_promo_banner_dismissed'

const COPY = {
  en: {
    lead: (days: number | null, code: string) => days ? `${days} days of PRO free with code ${code}` : `PRO free with code ${code}`,
    label: 'Promo code', redeem: 'Redeem', checking: 'Checking…', dismiss: 'Dismiss', region: 'PRO promo',
    done: 'Done: PRO is on. Every season and live mode are open.',
    errors: {
      INVALID_ACCESS_CODE: 'That code is not valid.',
      PROMO_EXPIRED: 'That code has ended.',
      RATE_LIMITED: 'Too many attempts. Wait a few minutes and try again.',
      PRO_ACCESS_UNAVAILABLE: 'Codes are not switched on yet.',
    } as Record<string, string>,
    failed: 'Could not check that code. Try again.',
  },
  es: {
    lead: (days: number | null, code: string) => days ? `${days} días de PRO gratis con el código ${code}` : `PRO gratis con el código ${code}`,
    label: 'Código promocional', redeem: 'Canjear', checking: 'Comprobando…', dismiss: 'Cerrar', region: 'Promoción PRO',
    done: 'Hecho: PRO activado. Todas las temporadas y el modo live están abiertos.',
    errors: {
      INVALID_ACCESS_CODE: 'Ese código no es válido.',
      PROMO_EXPIRED: 'Ese código ha caducado.',
      RATE_LIMITED: 'Demasiados intentos. Espera unos minutos y vuelve a probar.',
      PRO_ACCESS_UNAVAILABLE: 'Los códigos aún no están activados.',
    } as Record<string, string>,
    failed: 'No se ha podido comprobar el código. Vuelve a probar.',
  },
} as const

function readDismissed(): string | null {
  try { return window.sessionStorage.getItem(DISMISS_KEY) } catch { return null }
}

function writeDismissed(code: string) {
  try { window.sessionStorage.setItem(DISMISS_KEY, code) } catch { /* private mode: closed for this page only */ }
}

export function OpenWeekBanner() {
  const promo = usePromo()
  const pro = useAccessStore((st) => st.pro)
  const [lang, setLang] = useState<Lang>('en')
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [redeemed, setRedeemed] = useState(false)

  useEffect(() => {
    setLang(promoLanguage())
    setDismissed(readDismissed())
    setMounted(true)
  }, [])

  // The countdown moves by the minute; nothing it shows changes faster.
  useEffect(() => {
    if (!promo.active) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [promo.active])

  if (!mounted || !promo.active || !promo.code || !promo.until) return null
  if (dismissed === promo.code) return null
  if (pro && !redeemed) return null
  if (now >= Date.parse(promo.until)) return null

  const t = COPY[lang]
  const promoCode = promo.code

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const typed = code.trim()
    if (!typed || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await redeemAccessCode(typed)
      setRedeemed(true)
      setCode('')
    } catch (err) {
      const apiCode = err instanceof ApiError ? err.code : ''
      setError(t.errors[apiCode] ?? t.failed)
    } finally {
      setSubmitting(false)
    }
  }

  function dismiss() {
    writeDismissed(promoCode)
    setDismissed(promoCode)
  }

  return (
    <aside className={s.banner} aria-label={t.region} data-promo-banner="" lang={lang}>
      <p className={s.lead}>
        <strong>{t.lead(promo.days, promoCode)}</strong>
        <span className={s.left} data-promo-remaining="">{remainingText(promo.until, now, lang)}</span>
      </p>
      {redeemed ? null : (
        <form className={s.form} onSubmit={submit}>
          <label htmlFor="promo-code" className={ui.srOnly}>{t.label}</label>
          <input
            id="promo-code"
            type="text"
            value={code}
            onChange={(e) => { setCode(e.target.value); setError(null) }}
            placeholder={promoCode}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={error !== null}
            aria-describedby="promo-code-status"
            className={`${ui.input} ${s.input}`}
          />
          <button type="submit" disabled={submitting || code.trim().length === 0} className={buttonClass('primary')}>
            {submitting ? t.checking : t.redeem}
          </button>
        </form>
      )}
      <p id="promo-code-status" role="status" aria-live="polite" className={redeemed ? s.done : error ? s.error : ui.srOnly}>
        {redeemed ? t.done : error ?? ''}
      </p>
      <button type="button" className={s.close} onClick={dismiss} aria-label={t.dismiss}>×</button>
    </aside>
  )
}
