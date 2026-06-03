'use client'

import { useState, useRef, useEffect } from 'react'

type Module = 'pace' | 'degradation' | 'pit' | 'chaos' | 'notes'

const COPY: Record<Module, string> = {
  pace:
    'Median of clean lap durations. Excludes pit in/out, SC/VSC laps, and statistical outliers (>2.5× IQR). Min 5 clean laps required.',
  degradation:
    'Linear regression slope (s/lap) fitted to clean lap times within each stint. SC/VSC and pit-out laps excluded. Slope ≥ 0.08 = High cliff.',
  pit:
    'Position delta = position at pit_lap−1 vs position at pit_lap+3, reconstructed from timestamp-based OpenF1 position data.',
  chaos:
    'Weighted sum: SC events (×15, max 30), yellows (×3, max 20), investigations (×5, max 20), penalties (×4, max 15), rain periods (×10, max 15), position volatility (÷5, max 20). Cap 100.',
  notes:
    'Deterministic signals generated from computed metrics. No AI generation — thresholds trigger note templates. All data sourced from the same OpenF1 session.',
}

type Props = {
  module: Module
}

export function MethodologyBadge({ module }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          'inline-flex items-center gap-1 px-[5px] py-[2px]',
          'bg-bg-elevated border rounded-[2px]',
          'font-mono text-[8px] transition-colors',
          open
            ? 'border-signal-blue text-signal-blue'
            : 'border-border-subtle text-text-muted hover:border-signal-blue hover:text-signal-blue',
        ].join(' ')}
        title="Methodology"
        aria-label="Show methodology"
      >
        <span>⚙</span>
        <span>methodology</span>
      </button>

      {open && (
        <div className="absolute bottom-[calc(100%+4px)] left-0 z-50 w-[280px] bg-bg-panel border border-border-default rounded-[3px] shadow-xl p-3">
          <div className="font-display font-bold text-[8px] uppercase tracking-[1.5px] text-text-muted mb-1.5">
            How this is calculated
          </div>
          <p className="font-mono text-[10px] text-text-secondary leading-relaxed">
            {COPY[module]}
          </p>
        </div>
      )}
    </div>
  )
}
