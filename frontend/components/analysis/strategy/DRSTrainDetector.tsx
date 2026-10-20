'use client'

import { useState } from 'react'
import type { DRSAnalysisAggregated, MeaningfulDRSTrain } from '@/types'
import { MethodologyBadge } from '@/components/ui/MethodologyBadge'
import { Badge, Panel, toneClass, ui, type Tone } from '@/components/ui'
import a from '../analysis.module.css'

type Props = {
  drs: DRSAnalysisAggregated
}

const IMPACT_TONE: Record<string, Tone> = { High: 'accent', Medium: 'warn', Low: 'muted' }

function TrainCard({ train, isHighlight }: { train: MeaningfulDRSTrain; isHighlight: boolean }) {
  const mins = Math.floor(train.duration_seconds / 60)
  const secs = train.duration_seconds % 60
  const durationLabel = mins > 0 ? `${mins}m${secs}s` : `${secs}s`

  return (
    <div className={`${a.item} ${isHighlight ? a.highlight : ''}`} style={{ display: 'grid', gap: 8 }}>
      {/* Header */}
      <div className={`${a.between} ${a.wrap}`}>
        <span className={a.row}>
          <span className={ui.sub}>Laps {train.lap_start} to {train.lap_end}</span>
          {isHighlight && <Badge tone="info" solid>Peak</Badge>}
        </span>
        <span className={a.row}>
          <span className={ui.sub}>{train.peak_length} cars · {durationLabel}</span>
          <Badge tone={IMPACT_TONE[train.impact] ?? 'muted'}>{train.impact}</Badge>
        </span>
      </div>

      {/* Leader + trapped drivers */}
      {(train.leader || train.trapped_drivers.length > 0) && (
        <div className={`${a.row} ${a.wrap}`} style={{ gap: 12 }}>
          {train.leader && (
            <span className={a.row}>
              <span className={`${ui.label} ${toneClass('ok')}`}>Leader</span>
              <Badge tone="ok">{train.leader}</Badge>
            </span>
          )}
          {train.trapped_drivers.length > 0 && (
            <span className={`${a.row} ${a.wrap}`}>
              <span className={`${ui.label} ${toneClass('accent')}`}>Trapped</span>
              {train.trapped_drivers.map((code) => <Badge key={code} tone="accent">{code}</Badge>)}
            </span>
          )}
        </div>
      )}

      {/* Train dynamics (only if confidence >= Medium) */}
      {train.dynamics && train.dynamics.dynamics_confidence !== 'Low' && (
        <div className={`${a.row} ${a.wrap} ${ui.sub}`} style={{ gap: 12 }}>
          {train.dynamics.train_breaker && train.dynamics.breaker_lap && (
            <span>Escaped: <b className={toneClass('ok')}>{train.dynamics.train_breaker}</b> at L{train.dynamics.breaker_lap}</span>
          )}
          {train.dynamics.dropped_drivers.length > 0 && (
            <span>Dropped: {train.dynamics.dropped_drivers.join(', ')}</span>
          )}
        </div>
      )}

      {/* Summary */}
      <p className={a.para}>{train.summary}</p>
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
    <Panel
      title="DRS Train Detector"
      aside={<>{meaningful.length} meaningful train{meaningful.length !== 1 ? 's' : ''}<MethodologyBadge module="drs" /></>}
      padded={false}
      foot={meaningful.length > 0 ? (
        <span className={a.row} style={{ gap: 12 }}>
          <span>{drs.total_raw_snapshots} raw snapshots</span>
          {drs.suppressed_by_sc > 0 && <span className={toneClass('warn')}>{drs.suppressed_by_sc} suppressed by SC/VSC</span>}
        </span>
      ) : undefined}
    >
      {meaningful.length === 0 ? (
        <p className={ui.empty} style={{ margin: 0, textAlign: 'center' }}>
          No sustained DRS trains detected: racing was relatively open.
        </p>
      ) : (
        <>
          {/* Peak train summary metrics */}
          {peak && (
            <div className={a.kv} style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', borderLeft: 0, borderTop: 0 }}>
              {[
                { label: 'Peak length',  value: `${peak.peak_length} cars` },
                { label: 'Duration',     value: peak.duration_seconds >= 60 ? `${Math.floor(peak.duration_seconds / 60)}m${peak.duration_seconds % 60}s` : `${peak.duration_seconds}s` },
                { label: 'Total trains', value: String(meaningful.length) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div className={ui.label}>{label}</div>
                  <div className={ui.small}>{value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Train cards */}
          <div className={a.list}>
            {displayed.map((train, i) => (
              <TrainCard
                key={i}
                train={train}
                isHighlight={peak ? train.lap_start === peak.lap_start && train.lap_end === peak.lap_end : false}
              />
            ))}
          </div>

          {hasMore && (
            <div className={a.item} style={{ borderTop: '1px solid var(--pw-divider)' }}>
              <button type="button" onClick={() => setExpanded((v) => !v)} className={a.linkBtn} aria-expanded={expanded}>
                {expanded ? '▲ Show fewer' : `▼ Show ${meaningful.length - 2} more train${meaningful.length - 2 !== 1 ? 's' : ''}`}
              </button>
            </div>
          )}
        </>
      )}
    </Panel>
  )
}
