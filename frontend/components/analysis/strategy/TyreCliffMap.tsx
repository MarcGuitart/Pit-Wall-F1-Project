import type { TyreDegradationRow } from '@/types'
import { EstimatedLabel } from '@/components/ui/EstimatedLabel'
import { MethodologyBadge } from '@/components/ui/MethodologyBadge'
import { Panel, toneClass, ui, type Tone } from '@/components/ui'
import a from '../analysis.module.css'

type Props = {
  degradationRows: TyreDegradationRow[]
  onDriverClick: (code: string) => void
  sessionType?: string
}

type DriverWorstSlope = { code: string; slope: number; compound: string }
type RiskBucket = 'high' | 'medium' | 'stable'

const COL: Record<RiskBucket, { label: string; tone: Tone }> = {
  high:   { label: 'High cliff', tone: 'accent' },
  medium: { label: 'Watch',      tone: 'warn' },
  stable: { label: 'Stable',     tone: 'ok' },
}

function bucket(slope: number): RiskBucket {
  return slope >= 0.08 ? 'high' : slope >= 0.04 ? 'medium' : 'stable'
}

function dominant(rows: DriverWorstSlope[]) {
  if (!rows.length) return '–'
  const counts: Record<string, number> = {}
  rows.forEach((r) => { counts[r.compound] = (counts[r.compound] ?? 0) + 1 })
  return Object.entries(counts).sort((x, y) => y[1] - x[1])[0][0].slice(0, 4)
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

  const all = Object.values(byDriver).sort((x, y) => y.slope - x.slope)
  const high   = all.filter((d) => bucket(d.slope) === 'high')
  const medium = all.filter((d) => bucket(d.slope) === 'medium')
  const stable = all.filter((d) => bucket(d.slope) === 'stable')

  // If all drivers land in the same bucket → single wide column
  const allCols: [RiskBucket, DriverWorstSlope[]][] = [['high', high], ['medium', medium], ['stable', stable]]
  const nonEmptyBuckets = allCols.filter(([, g]) => g.length > 0)
  const columns: [RiskBucket, DriverWorstSlope[]][] = nonEmptyBuckets.length === 1 ? nonEmptyBuckets : allCols

  return (
    <Panel
      title="Tyre Cliff Map"
      aside={<>worst stint / driver<MethodologyBadge module="degradation" /></>}
      padded={false}
      foot={<span className={a.row}><EstimatedLabel /><span>slope = s/lap linear regression per stint</span></span>}
    >
      <div className={a.kv} style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`, borderLeft: 0 }}>
        {columns.map(([bkt, drivers]) => {
          const cfg = COL[bkt]
          return (
            <div key={bkt} style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
              <div className={`${a.row} ${a.colHead}`}>
                <span className={a.sq} style={{ background: 'currentColor' }} aria-hidden="true" />
                <span className={`${ui.label} ${toneClass(cfg.tone)}`} style={{ fontWeight: 800 }}>{cfg.label}</span>
              </div>
              <div className={a.list} style={{ flex: 1 }}>
                {drivers.length === 0 ? (
                  <div className={`${a.item} ${a.muted}`} style={{ textAlign: 'center' }}>–</div>
                ) : (
                  drivers.map((d) => (
                    <button key={d.code} type="button" onClick={() => onDriverClick(d.code)} className={`${a.itemBtn} ${a.between}`} style={{ display: 'flex', padding: '8px 14px' }}>
                      <span className={a.code}>{d.code}</span>
                      <span className={`${a.num} ${toneClass(cfg.tone)}`}>+{d.slope.toFixed(3)}</span>
                    </button>
                  ))
                )}
              </div>
              <div className={`${ui.sub} ${a.colFoot}`}>{dominant(drivers)}</div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
