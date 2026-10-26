'use client'

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { SessionMeta } from '@/types'
import { headerFacts } from '@/lib/sessionFacts'
import { PageHeader } from '@/components/ui'
import k from './skeleton.module.css'

/**
 * The analysis page's first screen as structure only (Block 27, concept 1a):
 * the real header with its real facts, then one cell per module at the height
 * the real module has (measured, skeleton.module.css), bars where data goes.
 * Used three ways: the loader (live), the arrival overlay (leaving) and the
 * blocked pages (ghost).
 */
export type SkeletonMode = 'loading' | 'waking' | 'error' | 'leaving' | 'ghost'

type Props = {
  sessionKey: number
  meta: SessionMeta | null
  mode: SkeletonMode
  /** The band's first column: the status cell (loader) — nothing otherwise. */
  status?: ReactNode
  /** The time rule's scaleX (0–1); omitted on blocked pages, which have none. */
  rule?: number
  /** Over everything, top-left: the blocked pages' status panel. */
  panel?: ReactNode
  className?: string
}

const i = (n: number) => ({ '--i': n % 6 } as CSSProperties)

function Bars({ widths, tall = 0 }: { widths: string[]; tall?: number }) {
  return (
    <div className={k.bars} aria-hidden="true">
      {widths.map((w, n) => (
        <span key={n} className={`${k.bar} ${n < tall ? k.barTall : ''}`} style={{ width: w }} />
      ))}
    </div>
  )
}

/** Animations pause while the tab is hidden (motion table: breathing). */
function useTabHidden() {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    const sync = () => setHidden(document.visibilityState === 'hidden')
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])
  return hidden
}

export function MethodPanel() {
  return (
    <>
      <h2 className={k.modTitle}>How this is measured</h2>
      <ol className={k.method}>
        <li><b>01</b><span>Pit, safety-car, red/yellow-flag and outlier laps are excluded from pace.</span></li>
        <li><b>02</b><span>Pace, tyre and pit estimates carry a confidence label.</span></li>
        <li><b>03</b><span>n is the number of clean laps behind a pace figure.</span></li>
      </ol>
    </>
  )
}

export function AnalysisSkeleton({ sessionKey, meta, mode, status, rule, panel, className = '' }: Props) {
  const hidden = useTabHidden()
  const facts = headerFacts(sessionKey, meta)
  const live = mode === 'loading' || mode === 'waking'
  const modeClass = mode === 'waking' ? k.waking : mode === 'error' ? k.error : mode === 'ghost' ? k.ghost : mode === 'leaving' ? k.leaving : ''

  return (
    <div
      className={`${k.page} ${modeClass} ${live ? k.breathe : ''} ${hidden ? k.paused : ''} ${className}`}
      aria-busy={live || undefined}
      data-skeleton={mode}
    >
      <div className={k.headLeftWrap}>
        <PageHeader
          kicker={facts.kicker}
          title={facts.title ?? <span className={`${k.bar} ${k.titleGhost}`} aria-hidden="true" />}
          meta={facts.line ?? <span className={`${k.bar} ${k.lineGhost}`} aria-hidden="true" />}
          right={
            mode === 'ghost' ? undefined : (
              <div className={k.headRight} data-skel="0" aria-hidden="true">
                <span className={k.statsGhost} />
                <span className={`${k.bar} ${k.badgeGhost}`} />
              </div>
            )
          }
        />
      </div>

      <div className={k.gridWrap}>
      {rule != null && (
        <div className={k.rule} aria-hidden="true" data-skel-rule>
          <span className={k.ruleGrey} style={{ transform: `scaleX(${rule})` }} />
          <span className={k.ruleAccent} style={{ transform: `scaleX(${rule})` }} />
        </div>
      )}
      <div className={k.grid}>
        <div className={`${k.mod} ${k.band}`} data-skel="1" style={i(1)}>
          {status ?? <div aria-hidden="true" />}
          <div className={k.dim}>
            <h2 className={k.modTitle}>Race phases</h2>
            <Bars widths={['100%', '86%', '64%', '92%']} tall={1} />
          </div>
        </div>
        <div className={`${k.mod} ${k.tabs} ${k.dim}`} data-skel="2" style={i(2)} aria-hidden="true">
          <Bars widths={['96px']} />
          <Bars widths={['110px']} />
          <Bars widths={['88px']} />
          <Bars widths={['92px']} />
        </div>
        <div className={`${k.mod} ${k.toggle} ${k.dim}`} data-skel="3" style={i(3)} aria-hidden="true">
          <Bars widths={['209px']} tall={1} />
        </div>
        <div className={`${k.mod} ${k.brain} ${k.dim}`} data-skel="4" style={i(4)}>
          {/* The slot that holds the Race Brain gets static, honest copy while it waits;
              on a blocked page it is ghost bars like the rest. */}
          {mode === 'ghost' ? <Bars widths={['40%', '96%', '88%', '70%']} tall={1} /> : <MethodPanel />}
        </div>
        <div className={`${k.mod} ${k.dna} ${k.dim}`} data-skel="5" style={i(5)} aria-hidden="true">
          <Bars widths={['34%', '80%']} />
        </div>
        <div className={`${k.mod} ${k.cells} ${k.dim}`} data-skel="6" style={i(6)}>
          <div>
            <h2 className={k.modTitle}>True Pace</h2>
            <Bars widths={['30%', '56%', '80%', '72%', '64%']} tall={1} />
          </div>
          <div>
            <h2 className={k.modTitle}>Key decisions</h2>
            <Bars widths={['92%', '84%', '88%']} />
          </div>
        </div>
      </div>
      {panel}
      </div>
    </div>
  )
}
