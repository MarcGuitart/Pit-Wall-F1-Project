import type { TyreDegradationRow } from '@/types'
import { formatSlope } from '@/lib/format'
import { COMPOUND_COLORS } from '@/lib/constants'
import { Badge, Panel, toneClass, ui, type Tone } from '@/components/ui'
import a from './analysis.module.css'

type Props = {
  rows: TyreDegradationRow[]
  onDriverClick?: (code: string) => void
  focusedDriver?: string | null
}

const CLIFF_TONE: Record<TyreDegradationRow['cliff_risk'], Tone> = { High: 'accent', Medium: 'warn', Low: 'ok' }
const CONF_TONE: Record<TyreDegradationRow['confidence'], Tone> = { High: 'ok', Medium: 'warn', Low: 'muted' }

const MAX_SLOPE = 0.10

export function TyreDegradationPanel({ rows, onDriverClick, focusedDriver }: Props) {
  return (
    <Panel title="Tyre Degradation" aside="s/lap slope · polyfit deg-1" padded={false}>
      <div className={a.list}>
        {rows.map((row, i) => {
          const tone = CLIFF_TONE[row.cliff_risk]
          const barWidth = Math.min((row.degradation_slope / MAX_SLOPE) * 100, 100)
          const compoundColor = COMPOUND_COLORS[row.compound] ?? 'var(--pw-muted)'
          const lapCount = row.lap_end - row.lap_start + 1
          const isFocused = focusedDriver === row.driver_code
          const isDefocused = focusedDriver != null && !isFocused
          const Tag = onDriverClick ? 'button' : 'div'

          return (
            <Tag
              key={i}
              {...(onDriverClick ? { type: 'button' as const, onClick: () => onDriverClick(row.driver_code) } : {})}
              className={`${onDriverClick ? a.itemBtn : a.item} ${isFocused ? a.rowOn : ''}`}
              style={{ display: 'grid', gap: 6, opacity: isDefocused ? 0.4 : 1 }}
            >
              <span className={a.row}>
                <span className={a.compound} style={{ borderColor: compoundColor, color: compoundColor }} aria-label={row.compound}>
                  {row.compound.slice(0, 1)}
                </span>
                <span className={`${a.row} ${a.grow}`}>
                  <span className={a.code}>{row.driver_code}</span>
                  <span className={ui.sub}>Stint {row.stint_number}</span>
                </span>
                <span className={a.num}>{formatSlope(row.degradation_slope)}</span>
                <Badge tone={tone}>{row.cliff_risk}</Badge>
              </span>

              <span className={a.track} style={{ height: 6 }}>
                <span className={toneClass(tone)} style={{ width: `${barWidth}%`, background: 'currentColor' }} />
              </span>

              <span className={`${a.row} ${ui.sub}`} style={{ gap: 12 }}>
                <span>L{row.lap_start}–{row.lap_end} ({lapCount} laps)</span>
                {row.tyre_age_start != null && <span>Age +{row.tyre_age_start}</span>}
                <span className={toneClass(CONF_TONE[row.confidence])} style={{ marginLeft: 'auto' }}>{row.confidence} conf.</span>
              </span>
            </Tag>
          )
        })}
      </div>
    </Panel>
  )
}
