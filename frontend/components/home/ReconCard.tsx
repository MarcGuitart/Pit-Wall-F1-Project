import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { featuredRecon, reconHref } from '@/lib/recon'
import { lapClock, personName, type Recon } from '@/components/recon/data'
import { buttonClass } from '@/components/ui'
import h from './home.module.css'

/**
 * "Recon Lap · São Paulo" on the landing (block 52b): a server-rendered card,
 * no 3D and no script on "/". The circuit is drawn as a static SVG from the
 * same file /recon/<slug> uses, read at build time; the card links there.
 * Nothing is rendered when no Recon Lap is featured (lib/recon.ts).
 */
export function ReconCard() {
  const entry = featuredRecon()
  if (!entry) return null
  const r = JSON.parse(readFileSync(join(process.cwd(), 'public', 'recon', `${entry.slug}.json`), 'utf8')) as Recon
  const W = 200, P = 8
  const xs = r.line.map((p) => p[0]), ys = r.line.map((p) => p[1])
  const x0 = Math.min(...xs), y0 = Math.min(...ys)
  const k = (W - 2 * P) / Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0)
  const H = Math.round((Math.max(...ys) - y0) * k + 2 * P)
  const d = `M${r.line.map(([x, y]) => `${(P + (x - x0) * k).toFixed(1)},${(H - P - (y - y0) * k).toFixed(1)}`).join(' L')} Z`
  return (
    <section className={h.recon} aria-labelledby="recon-card-title">
      <svg className={h.reconMap} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${r.circuit} from above`}>
        <path d={d} fill="none" stroke="var(--pw-text)" strokeWidth={2.5} strokeLinejoin="round" />
      </svg>
      <div className={h.reconText}>
        <span className={h.cardLabel}>Recon Lap · {entry.place}</span>
        <h2 className={h.reconTitle} id="recon-card-title">{r.circuit}, at pole pace</h2>
        <p className={h.reconSub}>
          {personName(r.lap.driver_name) ?? r.lap.driver}&apos;s {r.year} pole lap ({lapClock(r.lap.time)}) in 3D, before the {r.for_year} Grand Prix:
          {' '}{r.elevation_m} m of height and {r.zones.length} braking zones.
        </p>
      </div>
      <a className={buttonClass('default', true)} href={reconHref(entry.slug)}>Open the Recon Lap →</a>
    </section>
  )
}
