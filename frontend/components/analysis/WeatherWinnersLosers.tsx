import type { WeatherWinnersLosers as WeatherWinnersLosersType, WeatherWinner, WeatherLoser } from '@/types'

type Props = {
  data: WeatherWinnersLosersType
}

const CONFIDENCE_CLS: Record<string, string> = {
  High:   'text-signal-green border-signal-green/30',
  Medium: 'text-signal-amber border-signal-amber/30',
  Low:    'text-text-muted border-border-subtle',
}

function DriverChipSmall({ code }: { code: string }) {
  return (
    <span className="px-1.5 py-0.5 bg-bg-panel border border-border-default rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[0.5px] text-text-primary">
      {code}
    </span>
  )
}

function WinnerRow({ w }: { w: WeatherWinner }) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border-subtle last:border-b-0">
      <DriverChipSmall code={w.driver_code} />
      <div className="flex-1 min-w-0">
        <span className="font-mono font-bold text-[10px] text-signal-green">{w.gain}</span>
        <span className="font-mono text-[9px] text-text-muted ml-1.5">{w.reason}</span>
      </div>
      <span className={`shrink-0 px-1 py-0.5 border rounded-[2px] font-display font-bold text-[7px] uppercase tracking-[0.3px] ${CONFIDENCE_CLS[w.confidence] ?? ''}`}>
        {w.confidence}
      </span>
    </div>
  )
}

function LoserRow({ l }: { l: WeatherLoser }) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border-subtle last:border-b-0">
      <DriverChipSmall code={l.driver_code} />
      <div className="flex-1 min-w-0">
        <span className="font-mono font-bold text-[10px] text-signal-red">{l.loss}</span>
        <span className="font-mono text-[9px] text-text-muted ml-1.5">{l.reason}</span>
      </div>
      <span className={`shrink-0 px-1 py-0.5 border rounded-[2px] font-display font-bold text-[7px] uppercase tracking-[0.3px] ${CONFIDENCE_CLS[l.confidence] ?? ''}`}>
        {l.confidence}
      </span>
    </div>
  )
}

export function WeatherWinnersLosers({ data }: Props) {
  if (!data.winners.length && !data.losers.length) return null

  return (
    <div>
      <div className="font-display font-bold text-[8px] uppercase tracking-[1px] text-text-muted mb-2">
        Weather Winners &amp; Losers
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Winners column */}
        <div className="bg-bg-elevated border border-border-subtle rounded-[3px] p-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-signal-green shrink-0" />
            <span className="font-display font-bold text-[8px] uppercase tracking-[0.8px] text-signal-green">
              Winners
            </span>
          </div>
          {data.winners.length > 0
            ? data.winners.map((w, i) => <WinnerRow key={i} w={w} />)
            : <span className="font-mono text-[9px] text-text-muted">None identified</span>
          }
        </div>

        {/* Losers column */}
        <div className="bg-bg-elevated border border-border-subtle rounded-[3px] p-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-signal-red shrink-0" />
            <span className="font-display font-bold text-[8px] uppercase tracking-[0.8px] text-signal-red">
              Losers
            </span>
          </div>
          {data.losers.length > 0
            ? data.losers.map((l, i) => <LoserRow key={i} l={l} />)
            : <span className="font-mono text-[9px] text-text-muted">None identified</span>
          }
        </div>
      </div>

      {/* Attribution note — shown when concurrent SC may have influenced results */}
      {data.attribution_note && (
        <div className="mt-2 flex items-start gap-1.5 px-2 py-1.5 bg-signal-amber/10 border border-signal-amber/30 rounded-[2px]">
          <span className="text-signal-amber text-[10px] shrink-0">ⓘ</span>
          <span className="font-mono text-[9px] text-signal-amber leading-snug">
            {data.attribution_note}
          </span>
        </div>
      )}
    </div>
  )
}
