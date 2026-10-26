import Link from 'next/link'
import { RACE_LIST_HREF } from '@/lib/routes'
import h from './home.module.css'

export function Closing() {
  return (
    <section className={h.closing} aria-labelledby="closing-title">
      <h2 id="closing-title" className={h.closingTitle}>Pick a race.</h2>
      <Link href={RACE_LIST_HREF} className={h.closingLink}>Open the season grid <span aria-hidden="true">→</span></Link>
    </section>
  )
}
