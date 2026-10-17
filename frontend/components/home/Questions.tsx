import h from './home.module.css'

/** Abstract diagrams: shapes only, no data. Decorative (aria-hidden). */
const D = {
  pace: (
    <svg viewBox="0 0 240 96" className={h.diagram} aria-hidden="true" focusable="false">
      {[78, 70, 74, 40, 72, 69, 71, 30, 73, 70].map((y, i) => (
        <rect key={i} x={i * 24 + 4} y={y} width="14" height={96 - y} fill="currentColor" opacity={y < 50 ? 0.18 : 0.9} />
      ))}
    </svg>
  ),
  tyre: (
    <svg viewBox="0 0 240 96" className={h.diagram} aria-hidden="true" focusable="false">
      <polyline points="4,80 60,72 116,60 172,44 236,20" fill="none" stroke="currentColor" strokeWidth="3" />
      <polyline points="4,84 236,84" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3" />
    </svg>
  ),
  pit: (
    <svg viewBox="0 0 240 96" className={h.diagram} aria-hidden="true" focusable="false">
      <polyline points="4,30 100,30 120,70 236,70" fill="none" stroke="currentColor" strokeWidth="3" />
      <polyline points="4,60 100,60 120,40 236,40" fill="none" stroke="var(--pw-accent)" strokeWidth="3" />
    </svg>
  ),
  chaos: (
    <svg viewBox="0 0 240 96" className={h.diagram} aria-hidden="true" focusable="false">
      <rect x="4" y="44" width="232" height="8" fill="currentColor" opacity="0.2" />
      <rect x="4" y="44" width="170" height="8" fill="var(--pw-accent)" />
      <rect x="172" y="28" width="4" height="40" fill="currentColor" />
    </svg>
  ),
}

const Q = [
  { key: 'pace', label: 'Q1 · True pace', title: 'Who was really fast?', body: 'Pace from clean laps only. Pit, safety-car, outlier and untimed laps are removed before anything is compared.' },
  { key: 'tyre', label: 'Q2 · Tyre degradation', title: 'Who destroyed their tyres?', body: 'Lap time against tyre age for each stint. The slope is the degradation.' },
  { key: 'pit', label: 'Q3 · Pit cycles', title: 'Who gained from the pit cycle?', body: 'Position before and after each stop, so the effect of the timing of a stop is visible.' },
  { key: 'chaos', label: 'Q4 · Chaos index', title: 'How chaotic was it?', body: 'One score from 0 to 100 for how disrupted the race was.' },
] as const

export function Questions() {
  return (
    <section id="questions" className={`${h.section} ${h.anchored}`} aria-labelledby="questions-title">
      <div className={h.secHead}>
        <span className={h.secNum}>01 · Four questions</span>
        <h2 id="questions-title" className={h.secTitle}>What the broadcast doesn&apos;t show</h2>
      </div>
      <div className={`${h.grid} ${h.g4}`}>
        {Q.map((q) => (
          <article key={q.key} className={h.cell} data-reveal>
            {D[q.key]}
            <div className={h.qLabel}>{q.label}</div>
            <h3 className={h.qTitle}>{q.title}</h3>
            <p className={h.qBody}>{q.body}</p>
          </article>
        ))}
      </div>
      <p className={h.foot}>
        Diagrams are abstract. Real charts are in every race analysis, alongside DRS trains, dirty air, engineer
        notes, key decisions, a telemetry replay, team-radio links and an AI race engineer.
      </p>
    </section>
  )
}
