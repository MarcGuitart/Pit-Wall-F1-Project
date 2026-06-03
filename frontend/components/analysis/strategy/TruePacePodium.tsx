import type { TruePaceRow } from '@/types'
import { formatLapTime, formatDelta } from '@/lib/format'
import { ConfidenceChip } from '@/components/ui/ConfidenceChip'
import { EstimatedLabel } from '@/components/ui/EstimatedLabel'
import { MethodologyBadge } from '@/components/ui/MethodologyBadge'

type Props = {
  rows: TruePaceRow[]
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
  row, leader, isP1, onDriverClick,
}: {
  row: TruePaceRow; leader: number; isP1: boolean
  onDriverClick: (code: string, name: string) => void
}) {
  const delta = row.clean_pace - leader

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
        <div className="font-mono font-bold text-[13px] text-text-primary tabular-nums">{formatLapTime(row.clean_pace)}</div>
        <div className={`font-mono text-[9px] tabular-nums ${isP1 ? 'text-signal-green' : 'text-signal-amber'}`}>
          {isP1 ? 'Fastest' : formatDelta(delta)}
        </div>
      </div>
      <ConfidenceChip confidence={row.confidence} />
    </div>
  )
}

export function TruePacePodium({ rows, onDriverClick, onViewAll, sessionType }: Props) {
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
            <PodiumCard row={p2} leader={p1?.clean_pace ?? p2.clean_pace} isP1={false} onDriverClick={onDriverClick} />
          ) : <div className="bg-bg-elevated border border-border-subtle rounded-[4px] p-2.5 flex items-center justify-center"><span className="font-mono text-[9px] text-text-muted">No data</span></div>}
          {p1 ? (
            <PodiumCard row={p1} leader={p1.clean_pace} isP1={true} onDriverClick={onDriverClick} />
          ) : <div />}
          {p3 ? (
            <PodiumCard row={p3} leader={p1?.clean_pace ?? p3.clean_pace} isP1={false} onDriverClick={onDriverClick} />
          ) : <div className="bg-bg-elevated border border-border-subtle rounded-[4px] p-2.5 flex items-center justify-center"><span className="font-mono text-[9px] text-text-muted">No data</span></div>}
        </div>

        {insufficientDrivers && (
          <p className="font-mono text-[9px] text-signal-amber text-center mb-1.5">
            Insufficient clean lap data for {3 - top3.length} driver{3 - top3.length !== 1 ? 's' : ''}
          </p>
        )}

        <div className="flex items-center justify-between pt-1.5 border-t border-border-subtle">
          <EstimatedLabel />
          <button
            onClick={onViewAll}
            className="font-mono text-[10px] text-text-muted hover:text-signal-blue transition-colors"
          >
            Full table ({rows.length}) →
          </button>
        </div>
      </div>
    </div>
  )
}
