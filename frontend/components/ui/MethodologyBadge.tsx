'use client'

import { Popover } from './Popover'
import ui from './ui.module.css'

type Module = 'pace' | 'degradation' | 'pit' | 'chaos' | 'notes' | 'traffic' | 'weather' | 'crossover' | 'drs'

const COPY: Record<Module, string> = {
  pace:
    'Median of clean lap durations. Excludes pit in/out, SC/VSC, statistical outliers (>2.5× IQR) and laps with no timing. One clean lap is enough to be ranked; confidence is High from 12 clean laps, Medium from 6, Low below.',
  degradation:
    'Linear regression slope (s/lap) fitted to clean lap times within each stint. SC/VSC and pit-out laps excluded. Slope ≥ 0.08 = High cliff.',
  pit:
    'Position delta = position at pit_lap−1 vs position at pit_lap+3, reconstructed from timestamp-based OpenF1 position data.',
  chaos:
    'Method 2.0: each component is the fraction of the race in an altered state, scaled 0 to 1 and weighted, laps under SC/VSC (30), laps with local yellows (10), incidents noted + penalties per lap (20), wet laps (20), competitive place changes per driver-lap excluding pit cycles and SC laps (20). Levels: Low <15, Medium 15 to 31, High 32 to 54, Extreme ≥55.',
  notes:
    'Deterministic signals generated from computed metrics. No AI generation: thresholds trigger note templates. All data sourced from the same OpenF1 session.',
  traffic:
    'Groups of 3+ drivers where each gap_to_leader delta ≤ 1.0s, sampled from OpenF1 intervals data in 10-second windows. Mapped to lap numbers via lap.date_start timestamps.',
  weather:
    'OpenF1 weather telemetry (air/track temperature, rainfall) correlated with lap timestamps. OpenF1 rainfall is a 0/1 flag: a rain period needs ≥3 consecutive wet minutes after the first lap, and dry gaps of ≤2 minutes inside a shower are ignored. Temperature trend from per-lap averages.',
  crossover:
    'Crossover windows detected from DRY to WET and back changes between laps, using the same rain-period rule as the weather module. Attribution is approximate: concurrent safety cars may explain some position changes.',
  drs:
    'DRS trains detected from OpenF1 interval data (~4s resolution). Consecutive intervals where 3+ drivers are within 1.0s. Aggregated from raw snapshots by merging groups sharing ≥50% drivers. SC/VSC periods excluded.',
}

type Props = {
  module: Module
}

/** "How this is calculated", one click away (Popover: click, keyboard, Escape, outside). */
export function MethodologyBadge({ module }: Props) {
  return (
    <Popover
      trigger={<span>methodology</span>}
      triggerLabel="Show methodology"
      triggerClassName={`${ui.btn} ${ui.btnGhost}`}
      title="How this is calculated"
    >
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: 'var(--pw-muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>
        {COPY[module]}
      </p>
    </Popover>
  )
}
