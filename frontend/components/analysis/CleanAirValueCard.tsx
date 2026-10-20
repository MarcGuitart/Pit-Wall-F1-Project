import type { CleanAirValue } from '@/types'
import { MethodologyBadge } from '@/components/ui/MethodologyBadge'
import { EstimatedLabel } from '@/components/ui/EstimatedLabel'
import { Badge, ConfidenceBadge, Panel, toneClass, ui } from '@/components/ui'
import a from './analysis.module.css'

type Props = {
  data: CleanAirValue | null
}

export function CleanAirValueCard({ data }: Props) {
  const isActive =
    data !== null &&
    data.estimated_gain !== null &&
    data.confidence !== 'Low'

  // ── Greyed-out state ──────────────────────────────────────────────────────
  if (!isActive) {
    return (
      <Panel title={<span className={a.muted}>Clean Air Value</span>} aside={<MethodologyBadge module="drs" />}>
        <div style={{ display: 'grid', gap: 6, textAlign: 'center', padding: '12px 0' }}>
          <p className={a.para}>Insufficient comparison data for this session</p>
          <p className={a.para} style={{ opacity: 0.75 }}>Requires clean laps before and after escaping traffic</p>
        </div>
      </Panel>
    )
  }

  // ── Active state ──────────────────────────────────────────────────────────
  const gains = data!.drivers.map((d) => d.gain)
  const minGain = Math.min(...gains)
  const maxGain = Math.max(...gains)

  const rangeLabel =
    gains.length >= 2
      ? `+${minGain.toFixed(2)} to ${maxGain.toFixed(2)} s/lap`
      : `+${(data!.estimated_gain ?? 0).toFixed(2)} s/lap`

  return (
    <Panel
      title="Clean Air Value"
      aside={<><ConfidenceBadge level={data!.confidence} /><MethodologyBadge module="drs" /></>}
      foot={<span className={a.row}><EstimatedLabel /><span>estimated from pace comparison · small sample</span></span>}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        {/* Main value */}
        <div className={`${ui.mid} ${toneClass('info')}`}>{rangeLabel}</div>

        {/* Strategic implication */}
        <p className={a.para}>{data!.strategic_implication}</p>

        {/* Per-driver breakdown */}
        {data!.drivers.length > 0 && (
          <div style={{ display: 'grid', gap: 6 }}>
            <div className={ui.label}>Driver comparison</div>
            <div className={a.list} style={{ border: '2px solid var(--pw-divider)' }}>
              {data!.drivers.slice(0, 3).map((est) => (
                <div key={est.driver_code} className={`${a.between}`} style={{ padding: '8px 12px' }}>
                  <Badge tone="info">{est.driver_code}</Badge>
                  <span className={`${a.num} ${toneClass('info')}`}>+{est.gain.toFixed(3)}s</span>
                  <span className={`${ui.sub} ${a.grow}`} style={{ textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{est.context}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Panel>
  )
}
