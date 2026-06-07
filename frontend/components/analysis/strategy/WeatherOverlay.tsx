import type { WeatherAnalysis, WeatherLap, CrossoverWindow, WeatherWinnersLosers } from '@/types'
import { EstimatedLabel } from '@/components/ui/EstimatedLabel'
import { CrossoverWindowPanel } from '@/components/analysis/CrossoverWindowPanel'
import { WeatherWinnersLosers as WeatherWinnersLosersPanel } from '@/components/analysis/WeatherWinnersLosers'

type Props = {
  weather: WeatherAnalysis
  totalLaps: number
  crossoverWindows?: CrossoverWindow[]
  weatherWinners?: WeatherWinnersLosers | null
  sessionType?: string
}

const CONDITION_COLOR = {
  DRY:  { bar: '#23D18B', bg: 'rgba(35,209,139,.12)', text: 'text-signal-green' },
  DAMP: { bar: '#FFB020', bg: 'rgba(255,176,32,.12)',  text: 'text-signal-amber' },
  WET:  { bar: '#4DA3FF', bg: 'rgba(77,163,255,.12)',  text: 'text-signal-blue' },
}

const EVENT_COLOR: Record<string, string> = {
  RAIN_ONSET: '#4DA3FF',
  RAIN_END:   '#23D18B',
  TEMP_SPIKE: '#FFB020',
  TEMP_DROP:  '#8A94A6',
  PEAK_RAIN:  '#E8001D',
}

const IMPACT_PILL: Record<string, { cls: string; label: string }> = {
  None:   { cls: 'text-text-muted border-border-subtle',              label: 'No impact' },
  Low:    { cls: 'text-signal-green border-signal-green/30 bg-signal-green/10',  label: 'Low impact' },
  Medium: { cls: 'text-signal-amber border-signal-amber/30 bg-signal-amber/10',  label: 'Medium impact' },
  High:   { cls: 'text-signal-blue border-signal-blue/30 bg-signal-blue/10',     label: 'High impact' },
}

function ConditionBar({ laps, totalLaps }: { laps: WeatherLap[]; totalLaps: number }) {
  if (!laps.length) return null
  const lapMap = new Map(laps.map((l) => [l.lap_number, l]))

  return (
    <div className="flex rounded-[2px] overflow-hidden" style={{ height: '10px' }}>
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
    <svg width={W} height={H} style={{ display: 'block' }}>
      <polyline
        points={points}
        fill="none"
        stroke="#FFB020"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function WeatherOverlay({ weather, totalLaps, crossoverWindows, weatherWinners, sessionType = 'Race' }: Props) {
  const impactCfg = IMPACT_PILL[weather.strategy_impact] ?? IMPACT_PILL.None
  const totalCovered = weather.dry_laps + weather.damp_laps + weather.wet_laps
  const total = totalCovered || totalLaps || 1

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Weather Strategy Impact
        </span>
        <div className="flex items-center gap-2">
          <span className={`px-1.5 py-0.5 border rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[0.5px] ${impactCfg.cls}`}>
            {impactCfg.label}
          </span>
          <EstimatedLabel />
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Condition bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="font-display font-bold text-[8px] uppercase tracking-[1px] text-text-muted">
              Conditions by lap
            </span>
            <span className="font-mono text-[8px] text-text-muted">
              L1 → L{totalLaps}
            </span>
          </div>
          <ConditionBar laps={weather.lap_conditions} totalLaps={totalLaps} />
          {/* Condition legend */}
          <div className="flex items-center gap-3 mt-1.5">
            {(['DRY', 'DAMP', 'WET'] as const).map((cond) => {
              const count = cond === 'DRY' ? weather.dry_laps : cond === 'DAMP' ? weather.damp_laps : weather.wet_laps
              if (count === 0) return null
              const cfg = CONDITION_COLOR[cond]
              return (
                <div key={cond} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: cfg.bar }} />
                  <span className="font-mono text-[9px] text-text-muted">
                    {cond} <span className={`font-bold ${cfg.text}`}>{count}L</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Temperature + stats row */}
        <div className="grid grid-cols-2 gap-2">
          {/* Temperature sparkline */}
          <div>
            <div className="font-display font-bold text-[8px] uppercase tracking-[1px] text-text-muted mb-1">
              Track temp (°C)
            </div>
            <div className="flex items-end gap-2">
              <TempSparkline laps={weather.lap_conditions} />
              <div className="flex flex-col items-end shrink-0">
                <span className="font-mono font-bold text-[11px] text-signal-amber">
                  {weather.max_track_temp}°
                </span>
                <span className="font-mono text-[9px] text-text-muted">
                  {weather.min_track_temp}°
                </span>
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div className="space-y-1">
            {[
              { label: 'Avg track', value: `${weather.avg_track_temp}°C` },
              { label: 'Wet laps', value: `${weather.wet_laps} / ${total}` },
              { label: 'Peak rain', value: weather.peak_rainfall_lap ? `L${weather.peak_rainfall_lap}` : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="font-display font-bold text-[8px] uppercase tracking-[0.5px] text-text-muted">
                  {label}
                </span>
                <span className="font-mono text-[9px] text-text-primary tabular-nums">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Events */}
        {weather.events.length > 0 && (
          <div>
            <div className="font-display font-bold text-[8px] uppercase tracking-[1px] text-text-muted mb-1.5">
              Key events
            </div>
            <div className="space-y-1">
              {weather.events.slice(0, 4).map((ev, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div
                    className="w-1 mt-1 shrink-0 rounded-full"
                    style={{ height: '8px', backgroundColor: EVENT_COLOR[ev.event_type] ?? '#8A94A6' }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-[9px] text-text-secondary leading-snug">
                      {ev.message.length > 90 ? ev.message.slice(0, 90) + '…' : ev.message}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary */}
        <p className="font-mono text-[9px] text-text-muted pt-1 border-t border-border-subtle leading-relaxed">
          {weather.summary}
        </p>

        {/* V4: Crossover windows */}
        {(crossoverWindows ?? []).length > 0 && (
          <div className="pt-1 border-t border-border-subtle">
            <CrossoverWindowPanel
              windows={crossoverWindows!}
              sessionType={sessionType}
            />
          </div>
        )}

        {/* V4: Weather winners & losers */}
        {weatherWinners && (
          <div className="pt-1 border-t border-border-subtle">
            <WeatherWinnersLosersPanel data={weatherWinners} />
          </div>
        )}
      </div>
    </div>
  )
}
