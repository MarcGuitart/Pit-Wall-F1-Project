'use client'

export type SelectableDriver = {
  code: string
  colour: string
  rank: number | null
}

type Props = {
  drivers: SelectableDriver[]
  selected: string[]
  onToggle: (code: string) => void
  max?: number
}

export function DriverSelector({ drivers, selected, onToggle, max = 3 }: Props) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="font-display font-bold text-[8px] uppercase tracking-[1px] text-text-muted mr-1">
        Driver
      </span>
      {drivers.map((d) => {
        const active = selected.includes(d.code)
        return (
          <button
            key={d.code}
            onClick={() => onToggle(d.code)}
            className={[
              'flex items-center gap-1.5 px-2 py-1 rounded-[3px] border transition-all',
              active
                ? 'bg-bg-elevated'
                : 'border-border-subtle hover:border-border-default opacity-60 hover:opacity-100',
            ].join(' ')}
            style={active ? { borderColor: d.colour, backgroundColor: `${d.colour}22` } : undefined}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.colour }} />
            <span className="font-display font-bold text-[10px] uppercase tracking-[0.5px] text-text-primary">
              {d.code}
            </span>
            {d.rank != null && (
              <span className="font-mono text-[8px] text-text-muted">P{d.rank}</span>
            )}
          </button>
        )
      })}
      <span className="font-mono text-[8px] text-text-muted ml-1">max {max}</span>
    </div>
  )
}
