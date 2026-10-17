'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FREE_SEASONS, PRO_PRICE, PRO_PRICE_PERIOD, proSeasons } from '@/lib/access'
import { RACE_LIST_HREF } from '@/lib/routes'
import { useAccessStore } from '@/stores/accessStore'
import { AccessCodeForm } from '@/components/access/AccessCodeForm'
import { buttonClass } from '@/components/ui'
import h from './home.module.css'

/** Free and PRO, from lib/access.ts. No checkout, no notify list: neither exists. */
export function Plans() {
  const pro = useAccessStore((st) => st.pro)
  const [codeOpen, setCodeOpen] = useState(false)
  const firstPro = Math.min(...proSeasons())
  return (
    <section id="plans" className={`${h.section} ${h.anchored}`} aria-labelledby="plans-title">
      <div className={h.secHead}>
        <span className={h.secNum}>04 · Plans</span>
        <h2 id="plans-title" className={h.secTitle}>Free and PRO</h2>
        <p className={h.secLead}>Subscriptions are not open yet. PRO is available with an access code.</p>
      </div>
      <div className={`${h.grid} ${h.g2}`}>
        <div className={h.plan} data-reveal>
          <h3 className={h.planName}>Free</h3>
          <div className={h.planPrice}>{FREE_SEASONS.join(', ')}</div>
          <ul className={h.planList}>
            <li>Seasons {FREE_SEASONS.join(' and ')}</li>
            <li>No access code needed</li>
          </ul>
          <div><Link href={RACE_LIST_HREF} className={buttonClass('default', true)}>Pick a race</Link></div>
        </div>
        <div className={h.plan} data-reveal>
          <h3 className={h.planName}>PRO</h3>
          <div className={h.cardLabel}>Subscriptions not open</div>
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
            <div>
              <button type="button" className={buttonClass('primary', true)} aria-expanded={false} onClick={() => setCodeOpen(true)}>
                Enter access code
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
