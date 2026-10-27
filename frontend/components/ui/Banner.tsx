import type { ReactNode } from 'react'
import s from './ui.module.css'

/**
 * Live's status strip, generalised: a full-width band for page-level state
 * (a stale feed, an expired code, the analysis server waking). `bad` is the
 * accent and announces itself (role="alert"); the rest are polite status.
 */
export function Banner({ tone = 'ink', blink, right, children, className = '' }: {
  tone?: 'ink' | 'bad' | 'warn' | 'quiet'
  blink?: boolean
  right?: ReactNode
  children: ReactNode
  className?: string
}) {
  const toneClass = tone === 'bad' ? s.bannerBad : tone === 'warn' ? s.bannerWarn : tone === 'quiet' ? s.bannerQuiet : ''
  return (
    <div className={`${s.banner} ${toneClass} ${className}`} role={tone === 'bad' ? 'alert' : 'status'}>
      <span className={s.bannerItem}>{blink && <span className={s.blinker} aria-hidden="true" />}{children}</span>
      {right && <span className={s.bannerRight}>{right}</span>}
    </div>
  )
}
