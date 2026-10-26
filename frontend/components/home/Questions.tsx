'use client'

import dynamic from 'next/dynamic'
import type { ComponentType } from 'react'
import { useInView } from '@/lib/inView'
import h from './home.module.css'

/** The static diagrams, shown until each demo loads: shapes only, no data. Decorative (aria-hidden). */
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

// Each demo loads when its cell comes into view (block 37): "/" ships only the
// static diagrams, which stay in place, at the same height, until then.
const DEMO: Record<string, ComponentType> = {
  pace: dynamic(() => import('./questions/Q1Pace').then((m) => m.Q1Pace), { ssr: false }),
  tyre: dynamic(() => import('./questions/Q2Tyre').then((m) => m.Q2Tyre), { ssr: false }),
  pit: dynamic(() => import('./questions/Q3Pit').then((m) => m.Q3Pit), { ssr: false }),
  chaos: dynamic(() => import('./questions/Q4Chaos').then((m) => m.Q4Chaos), { ssr: false }),
}

const Q = [
  { key: 'pace', label: 'Q1 · True pace', tag: 'Illustrative', title: 'Who was really fast?', body: 'Pace from clean laps only. Pit, safety-car, outlier and untimed laps are removed before anything is compared.', look: 'Remove each kind of lap and watch the median line: it settles on the clean laps.' },
  { key: 'tyre', label: 'Q2 · Tyre degradation', tag: 'Illustrative', title: 'Who destroyed their tyres?', body: 'Lap time against tyre age for each stint. The slope is the degradation.', look: 'Drag a lap up or down: the fitted line and its slope move with it.' },
  { key: 'pit', label: 'Q3 · Pit cycles', tag: 'Illustrative', title: 'Who gained from the pit cycle?', body: 'Position before and after each stop, so the effect of the timing of a stop is visible.', look: 'Move the stop earlier or later, then add a safety car in the window.' },
  { key: 'chaos', label: 'Q4 · Chaos index', tag: 'Real formula, illustrative inputs', title: 'How chaotic was it?', body: 'One score from 0 to 100 for how disrupted the race was.', look: 'Each input fills its share of the 100 points up to its full scale.' },
] as const

function QuestionCell({ q }: { q: (typeof Q)[number] }) {
  const [ref, seen] = useInView<HTMLElement>()
  const Demo = DEMO[q.key]
  return (
    <article ref={ref} className={`${h.cell} ${h.qCell}`} data-reveal data-question={q.key}>
      <div className={h.qTag}>{q.tag}</div>
      <div className={h.qDemo} data-island="question" data-state={seen ? 'ok' : 'idle'}>
        {seen ? <Demo /> : D[q.key]}
      </div>
      <div className={h.qLabel}>{q.label}</div>
      <h3 className={h.qTitle}>{q.title}</h3>
      <p className={h.qBody}>{q.body}</p>
      <p className={h.qLook}><b>What to look for.</b> {q.look}</p>
    </article>
  )
}

export function Questions() {
  return (
    <section id="questions" className={`${h.section} ${h.anchored}`} aria-labelledby="questions-title">
      <div className={h.secHead}>
        <span className={h.secNum}>01 · Four questions</span>
        <h2 id="questions-title" className={h.secTitle}>What the broadcast doesn&apos;t show</h2>
      </div>
      <div className={`${h.grid} ${h.g4}`}>
        {Q.map((q) => <QuestionCell key={q.key} q={q} />)}
      </div>
      <p className={h.foot}>
        The demos are illustrative: no lap, tyre or gap in them is real. Q4 runs the real Chaos formula on
        inputs you set. Real charts are in every race analysis, alongside DRS trains, dirty air, engineer
        notes, key decisions, a telemetry replay, team-radio links and an AI race engineer.
      </p>
    </section>
  )
}
