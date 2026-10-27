import type { ChaosIndex } from '@/types'
import { CHAOS_COMPONENTS, CHAOS_LEVEL_TONE } from '@/lib/chaos'
import { Panel, toneClass, ui } from '@/components/ui'
import a from './analysis.module.css'

type Props = {
  chaos: ChaosIndex
}

export function ChaosIndexCard({ chaos }: Props) {
  const tone = toneClass(CHAOS_LEVEL_TONE[chaos.level] ?? 'muted')

  return (
    <Panel
      title="Chaos Index"
      aside={<b className={tone} style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{chaos.level}</b>}
    >
      <div style={{ display: 'grid', gap: 18 }}>
        {/* Score + level */}
        <div className={a.row} style={{ alignItems: 'flex-end', gap: 16 }}>
          <div>
            <div className={`${a.chaosScore} ${tone}`} style={{ fontSize: 64 }}>{chaos.score}</div>
            <div className={ui.label}>/ 100</div>
          </div>
          <p className={`${a.para} ${a.grow}`}>{chaos.summary}</p>
        </div>

        {/* Component bars */}
        <div style={{ display: 'grid', gap: 10 }}>
          {CHAOS_COMPONENTS.map(({ key, label, weight }) => {
            const value = chaos.components[key]
            const max = chaos.breakdown?.[key]?.weight ?? weight
            const pct = Math.round((value / max) * 100)
            return (
              <div key={key} title={chaos.breakdown?.[key]?.note ?? undefined}>
                <div className={a.between} style={{ marginBottom: 3 }}>
                  <span className={ui.label}>{label}</span>
                  <span className={a.num} style={{ fontSize: 12 }}>{value}/{max}</span>
                </div>
                <div className={a.track} style={{ height: 6 }}>
                  <span className={tone} style={{ width: `${pct}%`, background: 'currentColor' }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Peak chaos lap */}
        {chaos.peak_chaos_lap != null && (
          <div className={a.between} style={{ padding: '10px 14px', border: '2px solid var(--pw-divider)' }}>
            <span className={ui.label}>Peak chaos lap</span>
            <span className={`${ui.small} ${tone}`}>L{chaos.peak_chaos_lap}</span>
          </div>
        )}
      </div>
    </Panel>
  )
}
