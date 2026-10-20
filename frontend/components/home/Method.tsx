import h from './home.module.css'

const LEVELS = [
  { l: 'Low', n: 3, t: 'Little evidence behind the figure (for pace, few clean laps). Read it with care.' },
  { l: 'Medium', n: 7, t: 'A moderate amount of evidence behind the figure.' },
  { l: 'High', n: 12, t: 'Plenty of evidence behind the figure.' },
]

export function Method() {
  return (
    <section id="method" className={`${h.section} ${h.anchored}`} aria-labelledby="method-title">
      <div className={h.secHead}>
        <span className={h.secNum}>04 · How it is measured</span>
        <h2 id="method-title" className={h.secTitle}>Signals, not predictions</h2>
      </div>
      <div className={`${h.grid} ${h.g3}`}>
        <div className={h.cell} data-reveal>
          <h3 className={h.h3}>Confidence</h3>
          <p className={h.p}>
            Pace, tyre and pit estimates carry a Low, Medium or High confidence label. Each module sets it from the
            evidence behind its own figure, not only the number of clean laps. The Chaos Index is a measured score
            and carries no confidence label.
          </p>
          {LEVELS.map((c) => (
            <div key={c.l} style={{ marginTop: 14 }}>
              <div className={h.dots} aria-hidden="true">
                {Array.from({ length: 12 }, (_, i) => <span key={i} className={i < c.n ? h.on : ''} />)}
              </div>
              <p className={h.p}><b style={{ color: 'var(--pw-text)' }}>{c.l}.</b> {c.t}</p>
            </div>
          ))}
        </div>
        <div className={h.cell} data-reveal>
          <h3 className={h.h3}>Exclusion logs</h3>
          <p className={h.p}>
            Pit laps, safety-car laps, outlier laps and laps with no timing are removed from pace. The number of laps removed, by reason,
            is shown next to the figure, so it can be checked.
          </p>
        </div>
        <div className={h.cell} data-reveal>
          <h3 className={h.h3}>Signals, not predictions</h3>
          <p className={h.p}>
            Pit Wall Engineer measures what happened in a session. It describes pace, wear and timing from data. It
            does not forecast results.
          </p>
        </div>
      </div>
    </section>
  )
}
