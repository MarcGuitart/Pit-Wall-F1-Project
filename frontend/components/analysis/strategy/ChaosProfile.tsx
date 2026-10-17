import type { ChaosIndex } from '@/types'
import { EstimatedLabel } from '@/components/ui/EstimatedLabel'
import { MethodologyBadge } from '@/components/ui/MethodologyBadge'
import { CHAOS_COMPONENTS, CHAOS_LEVEL_TONE } from '@/lib/chaos'
import { Panel, toneClass, ui } from '@/components/ui'
import a from '../analysis.module.css'

type Props = { chaos: ChaosIndex }

const COMPONENTS = CHAOS_COMPONENTS.map(({ key, short, weight }) => ({ key, label: short, max: weight }))

export function ChaosProfile({ chaos }: Props) {
  const tone = toneClass(CHAOS_LEVEL_TONE[chaos.level] ?? 'muted')
  const isLow = chaos.level === 'Low'

  // Check if there are any meaningful events to display
  const hasEvents = Object.values(chaos.components).some((v) => v > 0)

  return (
    <Panel
      title="Chaos Profile"
      aside={<><b className={tone} style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{chaos.level}</b><MethodologyBadge module="chaos" /></>}
      foot={chaos.summary && !isLow ? chaos.summary : undefined}
    >
      {isLow ? (
        // Simplified low-disruption view
        <div className={a.chaosGrid}>
          <div>
            <div className={`${a.chaosScore} ${tone}`}>{chaos.score}</div>
            <div className={`${ui.label} ${tone}`} style={{ fontWeight: 800 }}>LOW DISRUPTION RACE</div>
            <div style={{ marginTop: 4 }}><EstimatedLabel /></div>
          </div>
          <div>
            <p className={a.para}>
              {chaos.summary || 'Minimal incidents. Race ran without significant SC, VSC, or weather disruption.'}
            </p>
            {chaos.peak_chaos_lap != null && (
              <div className={ui.sub} style={{ marginTop: 8 }}>Peak incident: L{chaos.peak_chaos_lap}</div>
            )}
          </div>
        </div>
      ) : (
        // Full chaos view
        <div className={a.chaosGrid}>
          {/* Left — score */}
          <div>
            <div className={`${a.chaosScore} ${tone}`}>{chaos.score}</div>
            <div className={`${ui.label} ${tone}`} style={{ fontWeight: 800 }}>{chaos.level}</div>
            {chaos.peak_chaos_lap != null && <div className={ui.sub} style={{ marginTop: 4 }}>Peak: L{chaos.peak_chaos_lap}</div>}
            <div style={{ marginTop: 4 }}><EstimatedLabel /></div>
          </div>

          {/* Right — component bars (only if there are events) */}
          {hasEvents && (
            <div style={{ display: 'grid', gap: 8, alignSelf: 'center' }}>
              {COMPONENTS.map(({ key, label, max }) => {
                const value = chaos.components[key]
                const pct = max > 0 ? Math.round((value / max) * 100) : 0
                if (value === 0) return null
                return (
                  <div key={key}>
                    <div className={a.between} style={{ marginBottom: 3 }}>
                      <span className={ui.label}>{label}</span>
                      <span className={a.num} style={{ fontSize: 12 }}>{value}</span>
                    </div>
                    <div className={a.track} style={{ height: 6 }} role="img" aria-label={`${label}: ${value} of ${max}`}>
                      <span className={tone} style={{ width: `${pct}%`, background: 'currentColor' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}
