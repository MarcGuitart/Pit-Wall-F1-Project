import type { TruePaceRow } from '@/types'
import { formatLapTime, formatDelta } from '@/lib/format'
import { ConfidenceChip } from '@/components/ui/ConfidenceChip'

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
  row,
  leader,
  isP1,
  onDriverClick,
  sessionType,
}: {
  row: TruePaceRow
  leader: number
  isP1: boolean
  onDriverClick: (code: string, name: string) => void
  sessionType: string
}) {
  const delta = row.clean_pace - leader

  return (
    <div
      onClick={() => onDriverClick(row.driver_code, row.team_name ?? row.driver_code)}
      className={[
        'cursor-pointer rounded-[4px] border p-3 flex flex-col gap-2 transition-all hover:brightness-110',
        isP1
          ? 'bg-[rgba(255,176,32,.04)] border-[rgba(255,176,32,.3)]'
          : 'bg-bg-elevated border-border-default',
      ].join(' ')}
    >
      {/* Position label */}
      <div
        className={`font-display font-black text-[11px] uppercase tracking-[1.5px] ${isP1 ? 'text-signal-amber' : 'text-text-muted'}`}
      >
        P{row.rank}
      </div>

      {/* Team color bar + driver code */}
      <div className="flex items-center gap-2">
        <div
          className="w-[6px] h-8 rounded-[1px] shrink-0"
          style={{ backgroundColor: row.team_colour ?? '#8A94A6' }}
        />
        <div>
          <div className="font-display font-black text-[20px] uppercase leading-none text-text-primary">
            {row.driver_code}
          </div>
          <div className="font-mono text-[9px] text-text-muted mt-0.5 truncate max-w-[100px]">
            {row.team_name ?? '–'}
          </div>
        </div>
      </div>

      {/* Pace */}
      <div>
        <div className="font-mono font-bold text-[13px] text-text-primary tabular-nums">
          {formatLapTime(row.clean_pace)}
        </div>
        <div className={`font-mono text-[10px] tabular-nums ${isP1 ? 'text-signal-green' : 'text-signal-amber'}`}>
          {isP1 ? 'Fastest' : formatDelta(delta)}
        </div>
      </div>

      <ConfidenceChip confidence={row.confidence} />
    </div>
  )
}

export function TruePacePodium({ rows, onDriverClick, onViewAll, sessionType }: Props) {
  const top3 = rows.filter((r) => r.rank <= 3).sort((a, b) => a.rank - b.rank)
  if (top3.length < 1) return null

  const leader = top3[0].clean_pace
  // P2 | P1 | P3 order
  const p1 = top3.find((r) => r.rank === 1)
  const p2 = top3.find((r) => r.rank === 2)
  const p3 = top3.find((r) => r.rank === 3)

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          True Pace
        </span>
        <span className="font-mono text-[10px] text-text-muted">
          {SESSION_LABEL[sessionType] ?? SESSION_LABEL['Race']}
        </span>
      </div>

      <div className="p-3">
        {/* Podium layout: P2 | P1 | P3 */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {p2 ? (
            <PodiumCard row={p2} leader={leader} isP1={false} onDriverClick={onDriverClick} sessionType={sessionType} />
          ) : <div />}
          {p1 && (
            <PodiumCard row={p1} leader={leader} isP1={true} onDriverClick={onDriverClick} sessionType={sessionType} />
          )}
          {p3 ? (
            <PodiumCard row={p3} leader={leader} isP1={false} onDriverClick={onDriverClick} sessionType={sessionType} />
          ) : <div />}
        </div>

        <button
          onClick={onViewAll}
          className="w-full text-center font-mono text-[10px] text-text-muted hover:text-signal-blue transition-colors py-1"
        >
          View full pace table ({rows.length} drivers) →
        </button>
      </div>
    </div>
  )
}
