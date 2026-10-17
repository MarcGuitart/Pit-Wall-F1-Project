import type { PitImpactRow } from '@/types'
import { formatLaneDuration, formatLapNumber } from '@/lib/format'
import { Badge, Panel, toneClass, ui, type Tone } from '@/components/ui'
import a from './analysis.module.css'

type Props = {
  rows: PitImpactRow[]
  onDriverClick?: (code: string) => void
  focusedDriver?: string | null
}

function PositionDeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) return <span className={a.muted}>–</span>
  if (delta === 0) return <span className={`${ui.small} ${a.muted}`}>±0</span>
  if (delta > 0)  return <span className={`${ui.small} ${toneClass('ok')}`}>+{delta}</span>
  return <span className={`${ui.small} ${toneClass('accent')}`}>{delta}</span>
}

const VERDICT_TONE = (verdict: string): Tone => {
  const v = verdict.toLowerCase()
  if (v.includes('optimal') || v.includes('clean') || v.includes('gained') || v.includes('sc winner')) return 'ok'
  if (v.includes('slow') || v.includes('costly') || v.includes('lost') || v.includes('failed')) return 'accent'
  return 'info'
}

export function PitImpactPanel({ rows, onDriverClick, focusedDriver }: Props) {
  // Red-flag stops are tyre changes under a suspension, not strategic stops — listed apart
  const validRows = rows.filter((r) => r.stop_type !== 'red_flag')
  const redFlagStops = rows.length - validRows.length

  return (
    <Panel
      title="Pit Stop Impact"
      aside="lane_duration · position delta"
      padded={false}
      foot={
        <ul className={a.footList} style={{ gap: 4 }}>
          {validRows.slice(0, 8).map((row, i) => (
            <li key={i}><b style={{ color: 'var(--pw-text)' }}>{row.driver_code}</b>{' '}{row.verdict}</li>
          ))}
        </ul>
      }
    >
      {redFlagStops > 0 && (
        <p className={ui.sub} style={{ margin: 0, padding: '8px 20px', borderBottom: '1px solid var(--pw-divider)' }}>
          {redFlagStops} stop{redFlagStops === 1 ? '' : 's'} under red flag not shown — tyres changed during the suspension.
        </p>
      )}
      <div className={a.list}>
        {validRows.map((row, i) => {
          const isFocused = focusedDriver === row.driver_code
          const isDefocused = focusedDriver != null && !isFocused
          const Tag = onDriverClick ? 'button' : 'div'

          return (
            <Tag
              key={i}
              {...(onDriverClick ? { type: 'button' as const, onClick: () => onDriverClick(row.driver_code) } : {})}
              className={`${onDriverClick ? a.itemBtn : a.item} ${isFocused ? a.rowOn : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: isDefocused ? 0.4 : 1 }}
            >
              <span style={{ width: 56, flex: 'none', textAlign: 'center' }}>
                <PositionDeltaBadge delta={row.net_position_change} />
                <span className={ui.label} style={{ display: 'block' }}>Net pos</span>
              </span>

              <span className={a.grow} style={{ display: 'grid', gap: 4 }}>
                <span className={a.row}>
                  <span className={a.code}>{row.driver_code}</span>
                  <span className={ui.sub}>{formatLapNumber(row.lap_number)}</span>
                  {row.stop_type === 'safety_car' && <Badge tone="warn">under SC</Badge>}
                </span>
                <span className={`${a.row} ${ui.sub}`} style={{ gap: 12 }}>
                  <span><b style={{ color: 'var(--pw-text)' }}>{formatLaneDuration(row.lane_duration)}</b> lane</span>
                  {row.position_before != null && row.position_after != null && (
                    <span>P{row.position_before} → P{row.position_after}</span>
                  )}
                </span>
              </span>

              <Badge tone={VERDICT_TONE(row.verdict)}>{row.confidence} conf.</Badge>
            </Tag>
          )
        })}
      </div>
    </Panel>
  )
}
