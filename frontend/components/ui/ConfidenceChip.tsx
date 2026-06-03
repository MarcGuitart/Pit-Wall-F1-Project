type ConfidenceChipProps = {
  confidence: 'Low' | 'Medium' | 'High'
  size?: 'sm' | 'xs'
}

const STYLES = {
  High:   'text-signal-green border-signal-green/40 bg-signal-green/10',
  Medium: 'text-signal-amber border-signal-amber/40 bg-signal-amber/10',
  Low:    'text-signal-red   border-signal-red/40   bg-signal-red/10',
}

export function ConfidenceChip({ confidence, size = 'xs' }: ConfidenceChipProps) {
  return (
    <span
      className={[
        'inline-flex items-center border rounded-[2px] font-display font-bold uppercase select-none',
        size === 'xs' ? 'px-[5px] py-[1px] text-[8px] tracking-[0.5px]' : 'px-2 py-0.5 text-[9px] tracking-[0.8px]',
        STYLES[confidence],
      ].join(' ')}
    >
      {confidence}
    </span>
  )
}
