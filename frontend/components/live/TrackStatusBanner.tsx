import type { Flag, TrackStatus } from '@/types/live'

type Props = {
  status: TrackStatus
  currentLap: number
  raceDistance: number | null
  raceDistanceSource: string
  chequered: boolean
}

const FLAG_STYLE: Record<Flag, { label: string; bar: string; text: string; ring: string }> = {
  GREEN:  { label: 'Green flag',          bar: 'bg-signal-green',  text: 'text-signal-green',  ring: 'border-signal-green/40' },
  YELLOW: { label: 'Yellow — sector',     bar: 'bg-signal-amber',  text: 'text-signal-amber',  ring: 'border-signal-amber/40' },
  SC:     { label: 'Safety car',          bar: 'bg-signal-amber',  text: 'text-signal-amber',  ring: 'border-signal-amber/60' },
  VSC:    { label: 'Virtual safety car',  bar: 'bg-signal-amber',  text: 'text-signal-amber',  ring: 'border-signal-amber/60' },
  RED:    { label: 'Red flag',            bar: 'bg-signal-red',    text: 'text-signal-red',    ring: 'border-signal-red/60' },
}

export function TrackStatusBanner({
  status, currentLap, raceDistance, raceDistanceSource, chequered,
}: Props) {
  const style = FLAG_STYLE[status.flag]
  const neutralising = status.flag === 'SC' || status.flag === 'VSC' || status.flag === 'RED'

  return (
    <div className={`bg-bg-panel border ${style.ring} rounded-[4px] overflow-hidden`}>
      <div className="flex items-stretch">
        <div className={`w-1.5 shrink-0 ${style.bar} ${neutralising ? 'animate-pulse' : ''}`} />

        <div className="flex-1 min-w-0 px-4 py-3 flex items-center gap-5 flex-wrap">
          <div className="min-w-0">
            <div className={`font-display font-black text-[20px] uppercase tracking-[1px] leading-none ${style.text}`}>
              {chequered ? 'Chequered flag' : style.label}
            </div>
            <div className="font-mono text-[10px] text-text-muted mt-1 truncate">
              {chequered ? 'Session finished' : `Race control: “${status.source}”`}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-6">
            <Stat label="Lap" value={raceDistance ? `${currentLap} / ${raceDistance}` : String(currentLap)} />
            {!raceDistance && (
              <div className="max-w-[240px]">
                <div className="font-display font-bold text-[8px] uppercase tracking-[1.5px] text-text-muted">
                  Race distance
                </div>
                <div className="font-mono text-[10px] text-text-secondary leading-snug">
                  not published live — {raceDistanceSource}
                </div>
              </div>
            )}
            <Stat
              label="Neutralised"
              value={`${status.neutralised_laps.length} lap${status.neutralised_laps.length === 1 ? '' : 's'}`}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-display font-bold text-[8px] uppercase tracking-[1.5px] text-text-muted">
        {label}
      </div>
      <div className="font-mono font-bold text-[16px] text-text-primary tabular-nums leading-tight">
        {value}
      </div>
    </div>
  )
}
