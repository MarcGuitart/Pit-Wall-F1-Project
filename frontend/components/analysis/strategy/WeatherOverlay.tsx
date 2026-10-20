import type { WeatherAnalysis, WeatherLap, CrossoverWindow, WeatherWinnersLosers } from '@/types'
import { EstimatedLabel } from '@/components/ui/EstimatedLabel'
import { CrossoverWindowPanel } from '@/components/analysis/CrossoverWindowPanel'
import { WeatherWinnersLosers as WeatherWinnersLosersPanel } from '@/components/analysis/WeatherWinnersLosers'
import { Badge, Panel, toneClass, ui, type Tone } from '@/components/ui'
import a from '../analysis.module.css'

type Props = {
  weather: WeatherAnalysis
  totalLaps: number
  crossoverWindows?: CrossoverWindow[]
  weatherWinners?: WeatherWinnersLosers | null
  sessionType?: string
}

const CONDITION_COLOR = {
  DRY:  { bar: 'var(--pw-green)', tone: 'ok' as Tone },
  WET:  { bar: 'var(--pw-blue)',  tone: 'info' as Tone },
}

const EVENT_COLOR: Record<string, string> = {
  RAIN_ONSET: 'var(--pw-blue)',
  RAIN_END:   'var(--pw-green)',
  TEMP_SPIKE: 'var(--pw-amber)',
  TEMP_DROP:  'var(--pw-muted)',
}

const IMPACT_PILL: Record<string, { tone: Tone; label: string }> = {
  None:   { tone: 'muted', label: 'No impact' },
  Low:    { tone: 'ok',    label: 'Low impact' },
  Medium: { tone: 'warn',  label: 'Medium impact' },
  High:   { tone: 'info',  label: 'High impact' },
}

function ConditionBar({ laps, totalLaps }: { laps: WeatherLap[]; totalLaps: number }) {
  if (!laps.length) return null
  const lapMap = new Map(laps.map((l) => [l.lap_number, l]))

  return (
    <div style={{ display: 'flex', height: 12 }} role="img" aria-label="Track condition by lap">
      {Array.from({ length: totalLaps }, (_, i) => {
        const lapNum = i + 1
        const lc = lapMap.get(lapNum)
        const cond = lc?.condition ?? 'DRY'
        const col = CONDITION_COLOR[cond as keyof typeof CONDITION_COLOR]
        return (
          <div
            key={lapNum}
            style={{ flex: 1, backgroundColor: col.bar, opacity: cond === 'DRY' ? 0.25 : 0.7 }}
            title={`L${lapNum}: ${cond} · ${lc?.track_temp ?? '?'}°C`}
          />
        )
      })}
    </div>
  )
}

function TempSparkline({ laps }: { laps: WeatherLap[] }) {
  if (laps.length < 2) return null

  const temps = laps.map((l) => l.track_temp)
  const minT = Math.min(...temps)
  const maxT = Math.max(...temps)
  const range = maxT - minT || 1

  const W = 200
  const H = 32
  const points = laps.map((l, i) => {
    const x = (i / (laps.length - 1)) * W
    const y = H - ((l.track_temp - minT) / range) * H
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  return (
    <svg width={W} height={H} style={{ display: 'block', maxWidth: '100%' }} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke="var(--pw-amber)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function WeatherOverlay({ weather, totalLaps, crossoverWindows, weatherWinners, sessionType = 'Race' }: Props) {
  const impactCfg = IMPACT_PILL[weather.strategy_impact] ?? IMPACT_PILL.None
  const totalCovered = weather.dry_laps + weather.wet_laps
  const total = totalCovered || totalLaps || 1

  return (
    <Panel
      title="Weather Strategy Impact"
      aside={<><Badge tone={impactCfg.tone}>{impactCfg.label}</Badge><EstimatedLabel /></>}
    >
      <div style={{ display: 'grid', gap: 16 }}>
        {/* Condition bar */}
        <div>
          <div className={a.between} style={{ marginBottom: 6 }}>
            <span className={ui.label}>Conditions by lap</span>
            <span className={ui.sub}>L1 → L{totalLaps}</span>
          </div>
          <ConditionBar laps={weather.lap_conditions} totalLaps={totalLaps} />
          {/* Condition legend */}
          <div className={a.row} style={{ gap: 14, marginTop: 6 }}>
            {(['DRY', 'WET'] as const).map((cond) => {
              const count = cond === 'DRY' ? weather.dry_laps : weather.wet_laps
              if (count === 0) return null
              const cfg = CONDITION_COLOR[cond]
              return (
                <span key={cond} className={`${a.row} ${ui.sub}`}>
                  <span className={a.sq} style={{ background: cfg.bar }} aria-hidden="true" />
                  {cond} <b className={toneClass(cfg.tone)}>{count}L</b>
                </span>
              )
            })}
          </div>
        </div>

        {/* Temperature + stats row */}
        <div className={a.kv} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))' }}>
          {/* Temperature sparkline */}
          <div>
            <div className={ui.label} style={{ marginBottom: 6 }}>Track temp (°C)</div>
            <div className={a.row} style={{ alignItems: 'flex-end' }}>
              <TempSparkline laps={weather.lap_conditions} />
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <b className={toneClass('warn')}>{weather.max_track_temp}°</b>
                <span className={ui.sub}>{weather.min_track_temp}°</span>
              </span>
            </div>
          </div>

          {/* Quick stats */}
          <div style={{ display: 'grid', gap: 4, alignContent: 'start' }}>
            {[
              { label: 'Avg track', value: `${weather.avg_track_temp}°C` },
              { label: 'Wet laps', value: `${weather.wet_laps} / ${total}` },
              { label: 'Peak rain', value: weather.peak_rainfall_lap ? `L${weather.peak_rainfall_lap}` : 'n/a' },
            ].map(({ label, value }) => (
              <div key={label} className={a.between}>
                <span className={ui.label}>{label}</span>
                <span className={a.num}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Events */}
        {weather.events.length > 0 && (
          <div>
            <div className={ui.label} style={{ marginBottom: 6 }}>Key events</div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
              {weather.events.slice(0, 4).map((ev, i) => (
                <li key={i} className={a.row} style={{ alignItems: 'flex-start' }}>
                  <span className={a.swatch} style={{ background: EVENT_COLOR[ev.event_type] ?? 'var(--pw-muted)', minHeight: 14, marginTop: 2 }} aria-hidden="true" />
                  <span className={a.para}>{ev.message.length > 90 ? ev.message.slice(0, 90) + '…' : ev.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Summary */}
        <p className={a.para} style={{ paddingTop: 12, borderTop: '1px solid var(--pw-divider)' }}>{weather.summary}</p>

        {/* V4: Crossover windows */}
        {(crossoverWindows ?? []).length > 0 && (
          <div style={{ paddingTop: 12, borderTop: '1px solid var(--pw-divider)' }}>
            <CrossoverWindowPanel windows={crossoverWindows!} sessionType={sessionType} />
          </div>
        )}

        {/* V4: Weather winners & losers */}
        {weatherWinners && (
          <div style={{ paddingTop: 12, borderTop: '1px solid var(--pw-divider)' }}>
            <WeatherWinnersLosersPanel data={weatherWinners} />
          </div>
        )}
      </div>
    </Panel>
  )
}
