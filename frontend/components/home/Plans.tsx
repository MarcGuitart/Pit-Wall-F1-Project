'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FREE_SEASONS, PRO_PRICE, PRO_PRICE_PERIOD, proSeasons } from '@/lib/access'
import { RACE_LIST_HREF } from '@/lib/routes'
import { RACES_LABEL } from '@/lib/sweep'
import { SweepLink } from '@/components/layout/SweepLink'
import { useAccessStore } from '@/stores/accessStore'
import { AccessCodeForm } from '@/components/access/AccessCodeForm'
import { LazySubscribeButton as SubscribeButton } from '@/components/billing/lazy'
import { PAYMENTS_ENABLED } from '@/lib/paymentsFlag'
import { buttonClass } from '@/components/ui'
import h from './home.module.css'

/** Free and PRO, from lib/access.ts. Subscribe appears only with payments on (block 44). */
export function Plans() {
  const pro = useAccessStore((st) => st.pro)
  const [codeOpen, setCodeOpen] = useState(false)
  const firstPro = Math.min(...proSeasons())
  return (
    <section id="plans" className={`${h.section} ${h.anchored}`} aria-labelledby="plans-title">
      <div className={h.secHead}>
        <span className={h.secNum}>03 · Plans</span>
        <h2 id="plans-title" className={h.secTitle}>Free and PRO</h2>
        <p className={h.secLead}>{PAYMENTS_ENABLED ? 'PRO is a monthly subscription, or an access code.' : 'Subscriptions open soon. PRO is available with an access code.'}</p>
      </div>
      <div className={`${h.grid} ${h.g2}`}>
        <div className={h.plan} data-reveal>
          <h3 className={h.planName}>Free</h3>
          <div className={h.planPrice}>{FREE_SEASONS.join(', ')}</div>
          <ul className={h.planList}>
            <li>Seasons {FREE_SEASONS.join(' and ')}</li>
            <li>No access code needed</li>
          </ul>
          <div><SweepLink href={RACE_LIST_HREF} label={RACES_LABEL} className={buttonClass('default', true)}>Pick a race</SweepLink></div>
        </div>
        <div className={h.plan} data-reveal>
          <h3 className={h.planName}>PRO</h3>
          <div className={h.cardLabel}>{PAYMENTS_ENABLED ? 'Monthly, cancel any time' : 'Subscriptions open soon'}</div>
          <div><span className={h.planPrice}>{PRO_PRICE}</span> <span className={h.nextWhen}>/ {PRO_PRICE_PERIOD}</span></div>
          <ul className={h.planList}>
            <li>Seasons {firstPro} onwards</li>
            <li>The current season</li>
            <li>Live mode</li>
          </ul>
          {pro ? (
            <p className={h.p}>PRO access is active on this browser. <Link href="/settings">Settings</Link></p>
          ) : codeOpen ? (
            <AccessCodeForm id="plans-pro-code" autoFocus />
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <SubscribeButton id="plans-subscribe" />
              <div>
                <button type="button" className={buttonClass(PAYMENTS_ENABLED ? 'default' : 'primary', true)} aria-expanded={false} onClick={() => setCodeOpen(true)}>
                  Enter access code
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
