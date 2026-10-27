import { RACE_LIST_HREF } from '@/lib/routes'
import { RACES_LABEL } from '@/lib/sweep'
import { SweepLink } from '@/components/layout/SweepLink'
import h from './home.module.css'

export function Closing() {
  return (
    <section className={h.closing} aria-labelledby="closing-title">
      <h2 id="closing-title" className={h.closingTitle}>Pick a race.</h2>
      <SweepLink href={RACE_LIST_HREF} label={RACES_LABEL} className={h.closingLink}>Open the season grid <span aria-hidden="true">→</span></SweepLink>
    </section>
  )
}
