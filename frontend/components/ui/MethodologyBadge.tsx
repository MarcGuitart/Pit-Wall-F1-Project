'use client'

import { useState, useRef, useEffect } from 'react'

type Module = 'pace' | 'degradation' | 'pit' | 'chaos' | 'notes' | 'traffic' | 'weather' | 'crossover' | 'drs'

const COPY: Record<Module, string> = {
  pace:
    'Median of clean lap durations. Excludes pit in/out, SC/VSC laps, and statistical outliers (>2.5× IQR). Min 5 clean laps required.',
  degradation:
    'Linear regression slope (s/lap) fitted to clean lap times within each stint. SC/VSC and pit-out laps excluded. Slope ≥ 0.08 = High cliff.',
  pit:
    'Position delta = position at pit_lap−1 vs position at pit_lap+3, reconstructed from timestamp-based OpenF1 position data.',
  chaos:
    'Method 2.0: each component is the fraction of the race in an altered state, scaled 0–1 and weighted — laps under SC/VSC (30), laps with local yellows (10), incidents noted + penalties per lap (20), wet laps (20), competitive place changes per driver-lap excluding pit cycles and SC laps (20). Levels: Low <15, Medium 15–31, High 32–54, Extreme ≥55.',
  notes:
    'Deterministic signals generated from computed metrics. No AI generation — thresholds trigger note templates. All data sourced from the same OpenF1 session.',
  traffic:
    'Groups of 3+ drivers where each gap_to_leader delta ≤ 1.0s, sampled from OpenF1 intervals data in 10-second windows. Mapped to lap numbers via lap.date_start timestamps.',
  weather:
    'OpenF1 weather telemetry (air/track temperature, rainfall) correlated with lap timestamps. OpenF1 rainfall is a 0/1 flag: a rain period needs ≥3 consecutive wet minutes after the first lap, and dry gaps of ≤2 minutes inside a shower are ignored. Temperature trend from per-lap averages.',
  crossover:
    'Crossover windows detected from DRY↔WET changes between laps, using the same rain-period rule as the weather module. Attribution is approximate — concurrent safety cars may explain some position changes.',
  drs:
    'DRS trains detected from OpenF1 interval data (~4s resolution). Consecutive intervals where 3+ drivers are within 1.0s. Aggregated from raw snapshots by merging groups sharing ≥50% drivers. SC/VSC periods excluded.',
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
