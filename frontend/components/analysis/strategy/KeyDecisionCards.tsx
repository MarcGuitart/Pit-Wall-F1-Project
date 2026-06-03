'use client'

import { useState } from 'react'
import type { RaceDecision } from '@/types'
import { ConfidenceChip } from '@/components/ui/ConfidenceChip'

type Props = {
  decisions: RaceDecision[]
}

function impactColor(impact: string): string {
  const i = impact.toLowerCase()
  if (i.includes('+') || i.includes('gained') || i.includes('saved')) return 'text-signal-green'
  if (i.includes('-') || i.includes('lost') || i.includes('surrendered')) return 'text-signal-red'
  return 'text-signal-amber'
}

const RANK_OPACITY: Record<number, string> = {
  1: 'rgba(255,176,32,.25)',
  2: 'rgba(255,176,32,.15)',
  3: 'rgba(255,176,32,.10)',
  4: 'rgba(255,176,32,.10)',
  5: 'rgba(255,176,32,.10)',
}

export function KeyDecisionCards({ decisions }: Props) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? decisions : decisions.slice(0, 3)

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Key Decisions
        </span>
        <span className="font-mono text-[10px] text-text-muted">ranked by impact</span>
      </div>

      <div className="p-3 space-y-[6px]">
        {visible.map((dec) => (
          <div
            key={dec.rank}
            className="bg-bg-elevated border border-border-default rounded-[4px] px-3 py-[10px] flex gap-3"
          >
            {/* Rank watermark */}
            <div
              className="font-display font-black text-[28px] leading-none select-none tabular-nums shrink-0 mt-0.5"
              style={{ color: RANK_OPACITY[dec.rank] ?? RANK_OPACITY[5] }}
            >
              {dec.rank}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-0.5 flex-wrap">
                <span className="font-display font-bold text-[12px] uppercase tracking-[0.3px] text-text-primary leading-tight">
                  {dec.title}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {dec.lap_number != null && (
                    <span className="font-mono text-[9px] text-text-muted">L{dec.lap_number}</span>
                  )}
                  <ConfidenceChip confidence={dec.confidence} />
                </div>
              </div>

              <div className={`font-display font-bold text-[10px] uppercase tracking-[0.5px] mb-1 ${impactColor(dec.impact)}`}>
                {dec.impact}
              </div>

              <p
                className="font-mono text-[10px] text-text-secondary leading-relaxed"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {dec.explanation}
              </p>
            </div>
          </div>
        ))}

        {decisions.length > 3 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full text-center font-mono text-[10px] text-text-muted hover:text-signal-blue transition-colors py-1"
          >
            {expanded
              ? 'Collapse decisions'
              : `See all ${decisions.length} decisions →`}
          </button>
        )}
      </div>
    </div>
  )
}
