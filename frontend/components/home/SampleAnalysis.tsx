import Link from 'next/link'
import sample from '@/lib/landingSample.json'
import { FREE_SEASONS } from '@/lib/access'
import { buttonClass } from '@/components/ui'
import h from './home.module.css'

// The real stored analysis of São Paulo 2024 · Race (9636), written by
// scripts/build_landing_sample.py — not illustrative values.
const lap = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}`
const REASON_COLOUR = ['var(--pw-amber)', 'var(--pw-accent)', 'var(--pw-blue)', 'var(--pw-purple)']

export function SampleAnalysis() {
  const removed = sample.exclusion.removed
  const total = sample.exclusion.used + removed.reduce((n, r) => n + r.laps, 0)
  const free = FREE_SEASONS.includes(sample.year)
  return (
    <section id="analysis" className={`${h.section} ${h.anchored}`} aria-labelledby="analysis-title">
      <div className={h.secHead}>
        <span className={h.secNum}>02 · Sample analysis</span>
        <h2 id="analysis-title" className={h.secTitle}>Why the numbers differ from your memory</h2>
        <p className={h.secLead}>
          {sample.place} {sample.year}{free ? ' is in the free seasons' : ''}. Two parts of every analysis explain the
          difference: the exclusion log and the confidence label.
        </p>
      </div>
      <div className={h.sampleHead}>
        <span className={h.samplePlace}>{sample.place} {sample.year}</span>
        <span className={h.nextWhen}>{sample.session_name} · from the stored analysis</span>
      </div>
      <div className={`${h.grid} ${h.g3}`}>
        <div className={h.cell} data-reveal>
          <div className={h.cardLabel}>Chaos index</div>
          <div><span className={h.chaosValue}>{sample.chaos.score}</span> <span className={h.nextWhen}>/100 · {sample.chaos.level}</span></div>
          <div className={h.scale} aria-hidden="true"><span style={{ width: `${sample.chaos.score}%` }} /></div>
          <div className={h.scaleTicks} aria-hidden="true"><span>0</span><span>50</span><span>100</span></div>
        </div>
        <div className={h.cell} data-reveal>
          <div className={h.cardLabel}>True pace · median clean lap</div>
          {sample.true_pace.map((r) => (
            <div key={r.driver_code} className={h.paceRow}>
              <span className={h.paceSub}>{String(r.rank).padStart(2, '0')}</span>
              <span className={h.paceTeam} style={{ background: r.team_colour ? `#${r.team_colour}` : 'var(--pw-divider)' }} aria-hidden="true" />
              <span className={h.paceCode}>{r.driver_code}</span>
              <span className={h.paceSub}>n={r.clean_laps} · best {lap(r.fastest_clean_lap)}<br />{r.confidence} confidence</span>
              <span className={h.paceVal}>{lap(r.median_clean_lap)}</span>
            </div>
          ))}
        </div>
        <div className={h.cell} data-reveal>
          <div className={h.cardLabel}>Exclusion log · {sample.exclusion.driver_code} · {total} laps</div>
          <div className={h.byReason} aria-hidden="true">
            <span style={{ flex: sample.exclusion.used, background: 'var(--pw-muted)' }} />
            {removed.map((r, i) => <span key={r.reason} style={{ flex: r.laps, background: REASON_COLOUR[i % REASON_COLOUR.length] }} />)}
          </div>
          <ul className={h.legend}>
            <li><span className={h.swatch} style={{ background: 'var(--pw-muted)' }} aria-hidden="true" />Laps used for pace<b>{sample.exclusion.used}</b></li>
            {removed.map((r, i) => (
              <li key={r.reason}><span className={h.swatch} style={{ background: REASON_COLOUR[i % REASON_COLOUR.length] }} aria-hidden="true" />Removed: {r.reason}<b>{r.laps}</b></li>
            ))}
          </ul>
          <p className={h.p} style={{ marginTop: 12 }}>The number of laps removed, by reason.</p>
        </div>
      </div>
      <div className={`${h.grid} ${h.g2}`}>
        <div className={h.cell} data-reveal>
          <span className={h.noteNum} aria-hidden="true">1</span>
          <h3 className={h.h3}>Exclusion log</h3>
          <p className={h.p}>
            Pit, safety-car, outlier and untimed laps are removed from the pace figure, and the log gives the number of laps
            removed, by reason. The figure comes from the laps that remain, and their number is shown as n.
          </p>
        </div>
        <div className={h.cell} data-reveal>
          <span className={h.noteNum} aria-hidden="true">2</span>
          <h3 className={h.h3}>Confidence labels</h3>
          <p className={h.p}>
            Pace, tyre and pit estimates are marked Low, Medium or High. Each module sets the label from the evidence
            behind its own figure — for pace, how many clean laps it rests on. A Low label means read the figure with care.
          </p>
        </div>
      </div>
      <p className={h.foot}>
        <Link href={`/race/${sample.session_key}`} className={buttonClass('default', true)}>Open the full analysis →</Link>
      </p>
    </section>
  )
}
