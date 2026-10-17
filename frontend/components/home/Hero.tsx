import type { ReactNode } from 'react'
import Link from 'next/link'
import { FREE_SEASONS } from '@/lib/access'
import { RACE_LIST_HREF } from '@/lib/routes'
import { buttonClass } from '@/components/ui'
import h from './home.module.css'

/** The first screen: what the site is, the two ways in, and (aside) the next session. */
export function Hero({ aside }: { aside?: ReactNode }) {
  return (
    <section className={h.hero} aria-labelledby="hero-title">
      <div>
        <div className={h.kicker}><span className={h.square} aria-hidden="true" />Race strategy analysis · Unofficial</div>
        <h1 id="hero-title" className={h.display}>Every race, read like an engineer would.</h1>
        <p className={h.lead}>True pace, tyre degradation, pit cycles, chaos — measured, never guessed.</p>
        <div className={h.ctas}>
          <Link href={RACE_LIST_HREF} className={buttonClass('primary', true)}>Pick a race →</Link>
          <a href="#live" className={buttonClass('default', true)}>See live mode</a>
        </div>
        <p className={h.note}>Seasons {FREE_SEASONS.join(' and ')} are free.</p>
      </div>
      {aside}
    </section>
  )
}
