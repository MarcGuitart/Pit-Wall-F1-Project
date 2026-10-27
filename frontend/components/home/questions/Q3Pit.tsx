'use client'

import { useState } from 'react'
import { PIT, pitGaps, pitTraces } from '@/lib/questionsMath'
import { Slider } from './Slider'
import q from './questions.module.css'

const W = 240
const H = 110
const PAD = 10
const LO = -PIT.loss - 2
const HI = PIT.freshGain * PIT.laps * 0.6
const xOf = (lap: number) => PAD + ((lap - 1) * (W - 2 * PAD)) / (PIT.laps - 1)
const yOf = (v: number) => PAD + ((HI - v) / (HI - LO)) * (H - 2 * PAD)
const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${xOf(i + 1).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ')

/**
 * Q3: move A's stop; both cars' time against a car that never stops is
 * recomputed with a fixed pit loss and a fixed fresh tyre gain (both
 * illustrative). A safety car in the window makes the stop cheaper.
 */
export function Q3Pit() {
  const [aStop, setAStop] = useState(8)
  const [sc, setSc] = useState(false)
  const { a, b } = pitTraces(aStop, sc)
  const final = pitGaps(aStop, sc)[PIT.laps - 1]
  const scInWindow = sc && aStop >= PIT.scWindow[0] && aStop <= PIT.scWindow[1]
  return (
    <div className={q.demo}>
      <svg viewBox={`0 0 ${W} ${H}`} className={q.svg} role="img" aria-label={`Car A stops on lap ${aStop}, car B on lap ${PIT.bStop}. At the flag A is ${final === 0 ? 'level with' : final > 0 ? `ahead by ${final}` : `behind by ${-final}`} B.`}>
        {sc && <rect x={xOf(PIT.scWindow[0]) - 4} width={xOf(PIT.scWindow[1]) - xOf(PIT.scWindow[0]) + 8} y={0} height={H} fill="var(--pw-amber, #ffb020)" opacity="0.15" />}
        <path d={path(b)} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.7" />
        <path d={path(a)} fill="none" stroke="var(--pw-accent)" strokeWidth="3" />
      </svg>
      <Slider
        label="Car A stops on lap"
        min={2}
        max={PIT.laps - 1}
        step={1}
        value={aStop}
        onChange={setAStop}
        valueText={(v) => `lap ${v}`}
      />
      <div className={q.chips}>
        <button type="button" className={q.chip} aria-pressed={sc} onClick={() => setSc((v) => !v)}>Safety car in window</button>
      </div>
      <p className={q.readout} aria-live="polite">
        At the flag A is <b>{final === 0 ? 'level' : final > 0 ? `${final} ahead` : `${-final} behind`}</b> (B stops on lap {PIT.bStop})
      </p>
      <p className={q.note}>{scInWindow ? 'Gains are not timing alone: the safety car made this stop cheaper.' : ''}</p>
    </div>
  )
}
