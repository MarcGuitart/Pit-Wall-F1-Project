'use client'

import { fetchStats, type SiteStats } from '@/lib/api'
import { useIsland } from '@/lib/island'
import h from './home.module.css'

// Same sentences as GET /stats' definitions (app/api/stats.py), here so the
// footnotes are static and take the same space whatever the island does.
const NOTES = [
  'Sessions whose analysis this server has published with the current pipeline.',
  'Laps examined for True Pace, summed over every driver of every analysed session: the clean laps used plus the laps the exclusion log removed.',
  'Seasons with at least one analysed session.',
  'Sections every analysis is built from, as the pipeline defines them.',
]

const TILES: { label: string; value: (s: SiteStats) => string; sub?: (s: SiteStats) => string }[] = [
  { label: 'Sessions analysed', value: (s) => s.sessions.toLocaleString('en-GB') },
  { label: 'Driver laps examined', value: (s) => s.driver_laps.toLocaleString('en-GB') },
  { label: 'Seasons covered', value: (s) => String(s.seasons.length), sub: (s) => s.seasons.join(', ') },
  { label: 'Analysis modules', value: (s) => String(s.modules) },
]

/** The proof strip: GET /stats, counts from the published analyses. */
export function ProofStrip() {
  const island = useIsland(() => fetchStats())
  return (
    <section aria-label="The site in figures" data-island="stats" data-state={island.status}>
      <div className={`${h.grid} ${h.g4} ${h.proof}`}>
        {TILES.map((t, i) => (
          <div key={t.label} className={h.tile}>
            <div className={h.cardLabel}>{t.label}<span className={h.fn} aria-hidden="true">{i + 1}</span></div>
            {island.status === 'ok' ? (
              <>
                <div className={h.tileValue}>{t.value(island.data)}</div>
                {t.sub && <div className={h.tileSub}>{t.sub(island.data)}</div>}
              </>
            ) : island.status === 'loading' ? (
              <span className={h.bar} style={{ height: 40, width: '50%' }} aria-hidden="true" />
            ) : (
              <p className={h.unavailable}>Unavailable right now.</p>
            )}
          </div>
        ))}
      </div>
      <div className={h.foot}>
        <ol className={h.footList}>{NOTES.map((n) => <li key={n}>{n}</li>)}</ol>
      </div>
    </section>
  )
}
