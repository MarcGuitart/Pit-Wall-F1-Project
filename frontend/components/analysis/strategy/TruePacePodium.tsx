'use client'

import { useState } from 'react'
import type { TruePaceRow, RaceClassificationRow } from '@/types'
import { formatLapTime } from '@/lib/format'
import { ConfidenceChip } from '@/components/ui/ConfidenceChip'
import { EstimatedLabel } from '@/components/ui/EstimatedLabel'
import { MethodologyBadge } from '@/components/ui/MethodologyBadge'
import { RaceClassificationPanel } from '../RaceClassificationPanel'

type Props = {
  rows: TruePaceRow[]
  classification: RaceClassificationRow[]
  onDriverClick: (code: string, name: string) => void
  onViewAll: () => void
  sessionType: string
}

const SESSION_LABEL: Record<string, string> = {
  Race: 'Clean race pace · median clean laps',
  Qualifying: 'Best Q3 lap',
  Practice: 'Best representative lap',
}

function PodiumCard({
  row, isP1, onDriverClick,
}: {
  row: TruePaceRow; isP1: boolean
  onDriverClick: (code: string, name: string) => void
}) {
  return (
    <div
      onClick={() => onDriverClick(row.driver_code, row.team_name ?? row.driver_code)}
      className={[
        'cursor-pointer rounded-[4px] border p-2.5 flex flex-col gap-1.5 transition-all hover:brightness-110',
        isP1
          ? 'bg-[rgba(255,176,32,.04)] border-[rgba(255,176,32,.3)]'
          : 'bg-bg-elevated border-border-default',
      ].join(' ')}
    >
      <div className={`font-display font-black text-[11px] uppercase tracking-[1.5px] ${isP1 ? 'text-signal-amber' : 'text-text-muted'}`}>
        P{row.rank}
      </div>
      <div className="flex items-center gap-2">
        <div className="w-[5px] h-7 rounded-[1px] shrink-0" style={{ backgroundColor: row.team_colour ?? '#8A94A6' }} />
        <div>
          <div className="font-display font-black text-[18px] uppercase leading-none text-text-primary">{row.driver_code}</div>
          <div className="font-mono text-[9px] text-text-muted mt-0.5 truncate max-w-[90px]">{row.team_name ?? '–'}</div>
        </div>
      </div>
      <div>
        <div className="font-mono font-bold text-[13px] text-text-primary tabular-nums">{formatLapTime(row.median_clean_lap)}</div>
        <div className="font-mono text-[9px] tabular-nums text-text-muted">
          Best {formatLapTime(row.fastest_clean_lap)}
        </div>
      </div>
      <ConfidenceChip confidence={row.confidence} />
    </div>
  )
}

function RealPodiumRow({ classification, onDriverClick }: {
  classification: RaceClassificationRow[]
  onDriverClick: (code: string, name: string) => void
}) {
  const podium = classification
    .filter((r) => r.finishing_position != null && r.finishing_position <= 3)
    .sort((a, b) => (a.finishing_position ?? 99) - (b.finishing_position ?? 99))

  if (!podium.length) return null

  return (
    <div className="mb-2">
      <div className="font-display font-bold text-[8px] uppercase tracking-[1.5px] text-text-muted mb-1">
        Real Podium — race result
      </div>
      <div className="grid grid-cols-3 gap-2">
        {podium.map((r) => (
          <button
            key={r.driver_number}
            onClick={() => onDriverClick(r.driver_code, r.team_name ?? r.driver_code)}
            className="flex items-center gap-1.5 rounded-[3px] border border-border-subtle bg-bg-elevated px-2 py-1.5 hover:brightness-110 transition-all"
          >
            <span className="font-mono font-bold text-[10px] text-text-muted">P{r.finishing_position}</span>
            <span
              className="w-[3px] h-4 rounded-[1px] shrink-0"
              style={{ backgroundColor: r.team_colour ?? '#8A94A6' }}
            />
            <span className="font-display font-bold text-[11px] uppercase text-text-primary truncate">
              {r.driver_code}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function TruePacePodium({ rows, classification, onDriverClick, onViewAll, sessionType }: Props) {
  const [showClassification, setShowClassification] = useState(false)

  const top3 = rows.filter((r) => r.rank <= 3).sort((a, b) => a.rank - b.rank)

  const p1 = top3.find((r) => r.rank === 1)
  const p2 = top3.find((r) => r.rank === 2)
  const p3 = top3.find((r) => r.rank === 3)

  const insufficientDrivers = top3.length < 3

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          True Pace
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-text-muted">
            {SESSION_LABEL[sessionType] ?? SESSION_LABEL['Race']}
          </span>
          <MethodologyBadge module="pace" />
        </div>
      </div>

      <div className="p-3">
        {/* Podium layout: P2 | P1 | P3 */}
        <div className="grid grid-cols-3 gap-2 mb-2">
          {p2 ? (
            <PodiumCard row={p2} isP1={false} onDriverClick={onDriverClick} />
          ) : <div className="bg-bg-elevated border border-border-subtle rounded-[4px] p-2.5 flex items-center justify-center"><span className="font-mono text-[9px] text-text-muted">No data</span></div>}
          {p1 ? (
            <PodiumCard row={p1} isP1={true} onDriverClick={onDriverClick} />
          ) : <div />}
          {p3 ? (
            <PodiumCard row={p3} isP1={false} onDriverClick={onDriverClick} />
          ) : <div className="bg-bg-elevated border border-border-subtle rounded-[4px] p-2.5 flex items-center justify-center"><span className="font-mono text-[9px] text-text-muted">No data</span></div>}
        </div>

        {insufficientDrivers && (
          <p className="font-mono text-[9px] text-signal-amber text-center mb-1.5">
            Insufficient clean lap data for {3 - top3.length} driver{3 - top3.length !== 1 ? 's' : ''}
          </p>
        )}

        <RealPodiumRow classification={classification} onDriverClick={onDriverClick} />

        <div className="flex items-center justify-between pt-1.5 border-t border-border-subtle">
          <EstimatedLabel />
          <div className="flex items-center gap-3">
            {classification.length > 0 && (
              <button
                onClick={() => setShowClassification(true)}
                className="font-mono text-[10px] text-text-muted hover:text-signal-blue transition-colors"
              >
                Full classification ({classification.length}) →
              </button>
            )}
            <button
              onClick={onViewAll}
              className="font-mono text-[10px] text-text-muted hover:text-signal-blue transition-colors"
            >
              Full table ({rows.length}) →
            </button>
          </div>
        </div>
      </div>

      {showClassification && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setShowClassification(false)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-2xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <RaceClassificationPanel rows={classification} onDriverClick={onDriverClick} />
            <button
              onClick={() => setShowClassification(false)}
              className="mt-2 w-full font-mono text-[10px] text-text-muted hover:text-text-primary transition-colors"
            >
              Close ×
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
