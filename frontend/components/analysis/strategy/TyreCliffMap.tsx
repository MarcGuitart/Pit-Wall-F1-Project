import type { TyreDegradationRow } from '@/types'
import { EstimatedLabel } from '@/components/ui/EstimatedLabel'
import { MethodologyBadge } from '@/components/ui/MethodologyBadge'

type Props = {
  degradationRows: TyreDegradationRow[]
  onDriverClick: (code: string) => void
  sessionType?: string
}

type DriverWorstSlope = { code: string; slope: number; compound: string }
type RiskBucket = 'high' | 'medium' | 'stable'

const COL = {
  high:   { label: 'High cliff', dot: '#E8001D', text: 'text-signal-red',   bg: 'bg-signal-red/5',   border: 'border-signal-red/15' },
  medium: { label: 'Watch',      dot: '#FFB020', text: 'text-signal-amber', bg: 'bg-signal-amber/5', border: 'border-signal-amber/15' },
  stable: { label: 'Stable',     dot: '#23D18B', text: 'text-signal-green', bg: 'bg-signal-green/5', border: 'border-signal-green/15' },
}

function bucket(slope: number): RiskBucket {
  return slope >= 0.08 ? 'high' : slope >= 0.04 ? 'medium' : 'stable'
}

function dominant(rows: DriverWorstSlope[]) {
  if (!rows.length) return '–'
  const counts: Record<string, number> = {}
  rows.forEach((r) => { counts[r.compound] = (counts[r.compound] ?? 0) + 1 })
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0].slice(0, 4)
}

export function TyreCliffMap({ degradationRows, onDriverClick, sessionType }: Props) {
  if (sessionType && sessionType !== 'Race') return null

  // Worst slope per driver
  const byDriver: Record<string, DriverWorstSlope> = {}
  for (const row of degradationRows) {
    const ex = byDriver[row.driver_code]
    if (!ex || row.degradation_slope > ex.slope) {
      byDriver[row.driver_code] = { code: row.driver_code, slope: row.degradation_slope, compound: row.compound }
    }
  }

  const all = Object.values(byDriver).sort((a, b) => b.slope - a.slope)
  const high   = all.filter((d) => bucket(d.slope) === 'high')
  const medium = all.filter((d) => bucket(d.slope) === 'medium')
  const stable = all.filter((d) => bucket(d.slope) === 'stable')

  // If all drivers land in the same bucket → single wide column
  const allCols: [RiskBucket, DriverWorstSlope[]][] = [['high', high], ['medium', medium], ['stable', stable]]
  const nonEmptyBuckets = allCols.filter(([, g]) => g.length > 0)
  const columns: [RiskBucket, DriverWorstSlope[]][] = nonEmptyBuckets.length === 1 ? nonEmptyBuckets : allCols

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Tyre Cliff Map
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-text-muted">worst stint / driver</span>
          <MethodologyBadge module="degradation" />
        </div>
      </div>

      <div className="p-3">
        <div
          className="gap-2 mb-2"
          style={{ display: 'grid', gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}
        >
          {columns.map(([bkt, drivers]) => {
            const cfg = COL[bkt]
            return (
              <div key={bkt} className={`border rounded-[3px] overflow-hidden ${cfg.border} ${cfg.bg}`}>
                <div className="px-2 py-1.5 border-b border-inherit flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cfg.dot }} />
                  <span className={`font-display font-bold text-[9px] uppercase tracking-[1px] ${cfg.text}`}>{cfg.label}</span>
                </div>
                <div className="divide-y divide-border-subtle/40">
                  {drivers.length === 0 ? (
                    <div className="px-2 py-2 text-center font-mono text-[9px] text-text-muted">–</div>
                  ) : (
                    drivers.map((d) => (
                      <div
                        key={d.code}
                        onClick={() => onDriverClick(d.code)}
                        className="px-2 py-1.5 flex items-center gap-1.5 cursor-pointer hover:bg-bg-elevated transition-colors"
                      >
                        <span className="font-display font-bold text-[10px] uppercase tracking-[0.5px] text-text-primary flex-1">{d.code}</span>
                        <span className={`font-mono text-[9px] tabular-nums font-bold ${cfg.text}`}>+{d.slope.toFixed(3)}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="px-2 py-1 border-t border-inherit">
                  <span className="font-mono text-[8px] text-text-muted">{dominant(drivers)}</span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
          <div className="flex items-center gap-2">
            <EstimatedLabel />
            <span className="font-mono text-[8px] text-text-muted">slope = s/lap linear regression per stint</span>
          </div>
        </div>
      </div>
    </div>
  )
}
