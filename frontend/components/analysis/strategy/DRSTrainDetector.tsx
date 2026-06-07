'use client'

import { useState } from 'react'
import type { DRSAnalysisAggregated, MeaningfulDRSTrain } from '@/types'
import { MethodologyBadge } from '@/components/ui/MethodologyBadge'

type Props = {
  drs: DRSAnalysisAggregated
}

const IMPACT_CLS: Record<string, string> = {
  High:   'text-signal-red border-signal-red/30 bg-signal-red/10',
  Medium: 'text-signal-amber border-signal-amber/30 bg-signal-amber/10',
  Low:    'text-text-muted border-border-subtle',
}

function DriverChip({ code, tint }: { code: string; tint: 'green' | 'red' | 'muted' }) {
  const cls =
    tint === 'green' ? 'bg-signal-green/10 border-signal-green/30 text-signal-green' :
    tint === 'red'   ? 'bg-signal-red/10 border-signal-red/30 text-signal-red' :
                       'bg-bg-panel border-border-default text-text-primary'
  return (
    <span className={`px-1.5 py-0.5 border rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[0.5px] ${cls}`}>
      {code}
    </span>
  )
}

function TrainCard({ train, isHighlight }: { train: MeaningfulDRSTrain; isHighlight: boolean }) {
  const mins = Math.floor(train.duration_seconds / 60)
  const secs = train.duration_seconds % 60
  const durationLabel = mins > 0 ? `${mins}m${secs}s` : `${secs}s`

  return (
    <div
      className={[
        'rounded-[3px] p-2.5 space-y-2',
        isHighlight
          ? 'bg-signal-blue/10 border border-signal-blue/30'
          : 'bg-bg-elevated border border-border-subtle',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[9px] text-text-muted">
            Laps {train.lap_start}–{train.lap_end}
          </span>
          {isHighlight && (
            <span className="px-1 py-0.5 bg-signal-blue/20 border border-signal-blue/40 rounded-[2px] font-display font-bold text-[7px] uppercase tracking-[0.5px] text-signal-blue">
              Peak
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[9px] text-text-muted">
            {train.peak_length} cars · {durationLabel}
          </span>
          <span className={`px-1.5 py-0.5 border rounded-[2px] font-display font-bold text-[7px] uppercase tracking-[0.3px] ${IMPACT_CLS[train.impact] ?? ''}`}>
            {train.impact}
          </span>
        </div>
      </div>

      {/* Leader + trapped drivers */}
      {(train.leader || train.trapped_drivers.length > 0) && (
        <div className="flex items-center gap-2 flex-wrap">
          {train.leader && (
            <div className="flex items-center gap-1">
              <span className="font-display font-bold text-[7px] uppercase tracking-[0.5px] text-signal-green">
                Leader
              </span>
              <DriverChip code={train.leader} tint="green" />
            </div>
          )}
          {train.trapped_drivers.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="font-display font-bold text-[7px] uppercase tracking-[0.5px] text-signal-red">
                Trapped
              </span>
              {train.trapped_drivers.map((code) => (
                <DriverChip key={code} code={code} tint="red" />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Train dynamics (only if confidence >= Medium) */}
      {train.dynamics && train.dynamics.dynamics_confidence !== 'Low' && (
        <div className="flex items-center gap-3 flex-wrap text-[8px] font-mono text-text-muted pt-1 border-t border-border-subtle">
          {train.dynamics.train_breaker && train.dynamics.breaker_lap && (
            <span>Escaped: <span className="text-signal-green font-bold">{train.dynamics.train_breaker}</span> at L{train.dynamics.breaker_lap}</span>
          )}
          {train.dynamics.dropped_drivers.length > 0 && (
            <span>Dropped: {train.dynamics.dropped_drivers.join(', ')}</span>
          )}
        </div>
      )}

      {/* Summary */}
      <p className="font-mono text-[9px] text-text-secondary leading-snug">
        {train.summary}
      </p>
    </div>
  )
}

export function DRSTrainDetector({ drs }: Props) {
  const [expanded, setExpanded] = useState(false)

  const meaningful = drs.meaningful_trains ?? []
  const peak = drs.peak_train

  // Expanded shows all, collapsed shows peak + 1 more
  const displayed = expanded ? meaningful : meaningful.slice(0, 2)
  const hasMore = meaningful.length > 2

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          DRS Train Detector
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] text-text-muted">
            {meaningful.length} meaningful train{meaningful.length !== 1 ? 's' : ''}
          </span>
          <MethodologyBadge module="drs" />
        </div>
      </div>

      <div className="p-3 space-y-3">
        {meaningful.length === 0 ? (
          <p className="font-mono text-[10px] text-text-muted text-center py-2">
            No sustained DRS trains detected — racing was relatively open.
          </p>
        ) : (
          <>
            {/* Peak train summary metrics */}
            {peak && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Peak length',  value: `${peak.peak_length} cars` },
                  { label: 'Duration',     value: peak.duration_seconds >= 60 ? `${Math.floor(peak.duration_seconds / 60)}m${peak.duration_seconds % 60}s` : `${peak.duration_seconds}s` },
                  { label: 'Total trains', value: String(meaningful.length) },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-bg-elevated border border-border-subtle rounded-[3px] p-2 text-center">
                    <div className="font-display font-bold text-[8px] uppercase tracking-[0.5px] text-text-muted mb-0.5">
                      {label}
                    </div>
                    <div className="font-mono font-bold text-[12px] text-text-primary tabular-nums">
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Train cards */}
            <div className="space-y-2">
              {displayed.map((train, i) => (
                <TrainCard
                  key={i}
                  train={train}
                  isHighlight={peak ? train.lap_start === peak.lap_start && train.lap_end === peak.lap_end : false}
                />
              ))}
            </div>

            {hasMore && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="font-mono text-[9px] text-text-muted hover:text-text-secondary transition-colors"
              >
                {expanded ? '▲ Show fewer' : `▼ Show ${meaningful.length - 2} more train${meaningful.length - 2 !== 1 ? 's' : ''}`}
              </button>
            )}

            {/* Data transparency row */}
            <div className="flex items-center gap-3 pt-1 border-t border-border-subtle">
              <span className="font-mono text-[8px] text-text-muted">
                {drs.total_raw_snapshots} raw snapshots
              </span>
              {drs.suppressed_by_sc > 0 && (
                <span className="font-mono text-[8px] text-signal-amber">
                  {drs.suppressed_by_sc} suppressed by SC/VSC
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
