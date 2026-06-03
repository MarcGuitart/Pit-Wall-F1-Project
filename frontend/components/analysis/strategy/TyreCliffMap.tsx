import type { TyreDegradationRow } from '@/types'
import { EstimatedLabel } from '@/components/ui/EstimatedLabel'
import { MethodologyBadge } from '@/components/ui/MethodologyBadge'

type Props = {
  degradationRows: TyreDegradationRow[]
  onDriverClick: (code: string) => void
}

type DriverWorstSlope = {
  code: string
  team_colour?: string | null
  slope: number
  compound: string
}

type RiskBucket = 'high' | 'medium' | 'stable'

const COLUMN_CONFIG = {
  high:   { label: 'High cliff risk', dot: '#E8001D', text: 'text-signal-red',   bg: 'bg-signal-red/5',   border: 'border-signal-red/15' },
  medium: { label: 'Watch',           dot: '#FFB020', text: 'text-signal-amber', bg: 'bg-signal-amber/5', border: 'border-signal-amber/15' },
  stable: { label: 'Stable',          dot: '#23D18B', text: 'text-signal-green', bg: 'bg-signal-green/5', border: 'border-signal-green/15' },
}

function bucketDriver(slope: number): RiskBucket {
  if (slope >= 0.08) return 'high'
  if (slope >= 0.04) return 'medium'
  return 'stable'
}

function dominantCompound(rows: DriverWorstSlope[]): string {
  if (!rows.length) return '–'
  const counts: Record<string, number> = {}
  rows.forEach((r) => { counts[r.compound] = (counts[r.compound] ?? 0) + 1 })
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

export function TyreCliffMap({ degradationRows, onDriverClick }: Props) {
  // Compute worst slope per driver
  const byDriver: Record<string, DriverWorstSlope> = {}
  for (const row of degradationRows) {
    const existing = byDriver[row.driver_code]
    if (!existing || row.degradation_slope > existing.slope) {
      byDriver[row.driver_code] = {
        code: row.driver_code,
        slope: row.degradation_slope,
        compound: row.compound,
      }
    }
  }

  const allDrivers = Object.values(byDriver).sort((a, b) => b.slope - a.slope)
  const high   = allDrivers.filter((d) => bucketDriver(d.slope) === 'high')
  const medium = allDrivers.filter((d) => bucketDriver(d.slope) === 'medium')
  const stable = allDrivers.filter((d) => bucketDriver(d.slope) === 'stable')

  const columns: [RiskBucket, DriverWorstSlope[]][] = [
    ['high', high],
    ['medium', medium],
    ['stable', stable],
  ]

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Tyre Cliff Map
        </span>
        <span className="font-mono text-[10px] text-text-muted">worst stint per driver</span>
      </div>

      <div className="p-3">
        <div className="grid grid-cols-3 gap-2 mb-3">
          {columns.map(([bucket, drivers]) => {
            const cfg = COLUMN_CONFIG[bucket]
            return (
              <div key={bucket} className={`border rounded-[3px] overflow-hidden ${cfg.border} ${cfg.bg}`}>
                {/* Column header */}
                <div className="px-2 py-1.5 border-b border-inherit flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.dot }} />
                  <span className={`font-display font-bold text-[9px] uppercase tracking-[1px] ${cfg.text}`}>
                    {cfg.label}
                  </span>
                </div>

                {/* Driver rows */}
                <div className="divide-y divide-border-subtle/50">
                  {drivers.length === 0 ? (
                    <div className="px-2 py-2 text-center">
                      <span className="font-mono text-[9px] text-text-muted">–</span>
                    </div>
                  ) : (
                    drivers.map((d) => (
                      <div
                        key={d.code}
                        onClick={() => onDriverClick(d.code)}
                        className="px-2 py-1.5 flex items-center gap-1.5 cursor-pointer hover:bg-bg-elevated transition-colors"
                      >
                        <span className="font-display font-bold text-[11px] uppercase tracking-[0.5px] text-text-primary flex-1">
                          {d.code}
                        </span>
                        <span className={`font-mono text-[9px] tabular-nums font-bold ${cfg.text}`}>
                          +{d.slope.toFixed(3)}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {/* Column footer — dominant compound */}
                <div className="px-2 py-1 border-t border-inherit">
                  <span className="font-mono text-[8px] text-text-muted">
                    {dominantCompound(drivers).slice(0, 4)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
          <div className="flex items-center gap-2">
            <EstimatedLabel />
            <span className="font-mono text-[8px] text-text-muted">slope = s/lap linear regression per stint</span>
          </div>
          <MethodologyBadge module="degradation" />
        </div>
      </div>
    </div>
  )
}
