'use client'

import { useEffect, useState } from 'react'
import type { TruePaceRow, RaceClassificationRow } from '@/types'
import { formatLapTime } from '@/lib/format'
import { EstimatedLabel } from '@/components/ui/EstimatedLabel'
import { MethodologyBadge } from '@/components/ui/MethodologyBadge'
import { ConfidenceBadge, Panel, ui } from '@/components/ui'
import { RaceClassificationPanel } from '../RaceClassificationPanel'
import a from '../analysis.module.css'

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

const teamColour = (c: string | null | undefined) => (c ? `#${c.replace('#', '')}` : 'var(--pw-muted)')

function PodiumCard({
  row, isP1, onDriverClick,
}: {
  row: TruePaceRow; isP1: boolean
  onDriverClick: (code: string, name: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onDriverClick(row.driver_code, row.team_name ?? row.driver_code)}
      className={`${a.podiumCard} ${isP1 ? a.podiumP1 : ''}`}
    >
      <span className={ui.label} style={isP1 ? { color: 'var(--pw-accent-text)', fontWeight: 800 } : undefined}>P{row.rank}</span>
      <span className={a.row}>
        <span className={a.swatch} style={{ background: teamColour(row.team_colour) }} />
        <span style={{ minWidth: 0 }}>
          <span className={a.podiumCode}>{row.driver_code}</span>
          <span className={`${ui.sub} ${a.ellipsis}`}>{row.team_name ?? 'n/a'}</span>
        </span>
      </span>
      <span>
        <span className={a.podiumTime}>{formatLapTime(row.median_clean_lap)}</span>
        <span className={ui.sub} style={{ display: 'block' }}>Best {formatLapTime(row.fastest_clean_lap)}</span>
      </span>
      <ConfidenceBadge level={row.confidence} />
    </button>
  )
}

function RealPodiumRow({ classification, onDriverClick }: {
  classification: RaceClassificationRow[]
  onDriverClick: (code: string, name: string) => void
}) {
  const podium = classification
    .filter((r) => r.finishing_position != null && r.finishing_position <= 3)
    .sort((x, y) => (x.finishing_position ?? 99) - (y.finishing_position ?? 99))

  if (!podium.length) return null

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div className={ui.label}>Real Podium · race result</div>
      <div className={a.podium}>
        {podium.map((r) => (
          <button
            key={r.driver_number}
            type="button"
            onClick={() => onDriverClick(r.driver_code, r.team_name ?? r.driver_code)}
            className={ui.btn}
          >
            <span className={a.muted}>P{r.finishing_position}</span>
            <span className={a.swatch} style={{ background: teamColour(r.team_colour) }} />
            <span className={a.code}>{r.driver_code}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function TruePacePodium({ rows, classification, onDriverClick, onViewAll, sessionType }: Props) {
  const [showClassification, setShowClassification] = useState(false)

  useEffect(() => {
    if (!showClassification) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowClassification(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showClassification])

  const top3 = rows.filter((r) => r.rank <= 3).sort((x, y) => x.rank - y.rank)

  const p1 = top3.find((r) => r.rank === 1)
  const p2 = top3.find((r) => r.rank === 2)
  const p3 = top3.find((r) => r.rank === 3)

  const insufficientDrivers = top3.length < 3
  const noData = <div className={a.podiumEmpty}><span className={ui.sub}>No data</span></div>

  return (
    <Panel
      title="True Pace"
      aside={<>{SESSION_LABEL[sessionType] ?? SESSION_LABEL['Race']}<MethodologyBadge module="pace" /></>}
      foot={
        <div className={`${a.between} ${a.wrap}`}>
          <EstimatedLabel />
          <span className={a.row} style={{ gap: 16 }}>
            {classification.length > 0 && (
              <button type="button" onClick={() => setShowClassification(true)} className={a.linkBtn}>
                Full classification ({classification.length}) →
              </button>
            )}
            <button type="button" onClick={onViewAll} className={a.linkBtn}>
              Full table ({rows.length}) →
            </button>
          </span>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 12 }}>
        {/* Podium layout: P2 | P1 | P3 */}
        <div className={a.podium}>
          {p2 ? <PodiumCard row={p2} isP1={false} onDriverClick={onDriverClick} /> : noData}
          {p1 ? <PodiumCard row={p1} isP1={true} onDriverClick={onDriverClick} /> : <div />}
          {p3 ? <PodiumCard row={p3} isP1={false} onDriverClick={onDriverClick} /> : noData}
        </div>

        {insufficientDrivers && (
          <p className={a.para} style={{ color: 'var(--pw-amber)', textAlign: 'center' }}>
            Insufficient clean lap data for {3 - top3.length} driver{3 - top3.length !== 1 ? 's' : ''}
          </p>
        )}

        <RealPodiumRow classification={classification} onDriverClick={onDriverClick} />
      </div>

      {showClassification && (
        <div className={ui.backdrop} onClick={() => setShowClassification(false)}>
          <div className={ui.dialog} role="dialog" aria-modal="true" aria-label="Race classification" onClick={(e) => e.stopPropagation()}>
            <RaceClassificationPanel rows={classification} onDriverClick={onDriverClick} />
            <button type="button" onClick={() => setShowClassification(false)} className={`${ui.btn} ${a.dialogClose}`}>
              Close ×
            </button>
          </div>
        </div>
      )}
    </Panel>
  )
}
