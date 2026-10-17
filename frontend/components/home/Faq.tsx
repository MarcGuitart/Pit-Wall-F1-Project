'use client'

import { useState } from 'react'
import h from './home.module.css'

export const FAQS = [
  ['Is it official?', 'No. Pit Wall Engineer is an unofficial project and is not associated in any way with the Formula 1 companies.'],
  ['Where does the data come from?', 'Timing data comes via OpenF1 and FastF1. Live mode follows the OpenF1 feed.'],
  ['How reliable are the numbers?', 'Pace, tyre and pit estimates carry a Low, Medium or High confidence label based on the evidence behind them. The Chaos Index is a measured score and carries no confidence label. Exclusion logs give the number of laps removed, by reason. The numbers are signals about what happened, not predictions, and they can differ from the impression the broadcast gave.'],
  ['What does team radio do?', 'Team-radio clips are links to Formula 1’s archive. Nothing is hosted or stored on Pit Wall Engineer.'],
] as const

/** Buttons with aria-expanded / aria-controls; the first answer starts open, as in the prototype. */
export function Faq() {
  const [open, setOpen] = useState<number>(0)
  return (
    <section id="faq" className={`${h.section} ${h.anchored}`} aria-labelledby="faq-title">
      <div className={h.secHead}>
        <span className={h.secNum}>06 · FAQ</span>
        <h2 id="faq-title" className={h.secTitle}>Questions</h2>
      </div>
      <div className={h.faq}>
        {FAQS.map(([q, a], i) => {
          const on = open === i
          return (
            <div key={q} className={h.faqItem}>
              <h3 style={{ margin: 0 }}>
                <button
                  type="button"
                  className={h.faqBtn}
                  aria-expanded={on}
                  aria-controls={`faq-${i}`}
                  id={`faq-q-${i}`}
                  onClick={() => setOpen(on ? -1 : i)}
                >
                  {q}
                  <span className={h.faqSign} aria-hidden="true">{on ? '−' : '+'}</span>
                </button>
              </h3>
              <p id={`faq-${i}`} role="region" aria-labelledby={`faq-q-${i}`} className={h.faqAnswer} hidden={!on}>{a}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
