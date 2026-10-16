import type { ReactNode } from 'react'
import s from './ui.module.css'

export type Tone = 'neutral' | 'muted' | 'accent' | 'ok' | 'warn' | 'info' | 'purple'

const TONE: Record<Tone, string> = {
  neutral: s.toneNeutral, muted: s.toneMuted, accent: s.toneAccent, ok: s.toneOk,
  warn: s.toneWarn, info: s.toneInfo, purple: s.tonePurple,
}

/** The text colour of a tone, for a number or label that is not a badge. */
export function toneClass(tone: Tone): string {
  return TONE[tone]
}

/** A short uppercase tag. Outline by default; solid for the one thing that must stand out. */
export function Badge({ tone = 'neutral', solid, dashed, title, children, className = '' }: {
  tone?: Tone
  solid?: boolean
  dashed?: boolean
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <span title={title} className={`${s.badge} ${solid ? s.badgeSolid : s.badgeOutline} ${dashed ? s.badgeDashed : ''} ${TONE[tone]} ${className}`}>
      {children}
    </span>
  )
}

export type ModuleState = 'ok' | 'failed' | 'not_applicable'

/**
 * A module's state. "Failed" and "not applicable" must never look the same:
 * failed is the accent, solid; not applicable is muted and dashed.
 */
export function StatusBadge({ state }: { state: ModuleState }) {
  if (state === 'failed') return <Badge tone="accent" solid>Failed</Badge>
  if (state === 'not_applicable') return <Badge tone="muted" dashed>Not applicable</Badge>
  return <Badge tone="ok">OK</Badge>
}

export type Confidence = 'Low' | 'Medium' | 'High'
const DOTS: Record<Confidence, number> = { Low: 1, Medium: 2, High: 3 }

/** Live's confidence dots (1-3) with the word, so it never relies on the dots alone. */
export function ConfidenceBadge({ level, label = true, title }: { level: Confidence | null | undefined; label?: boolean; title?: string }) {
  if (!level) return <span className={s.confidence} title={title}><span className={s.toneMuted}>Unverified</span></span>
  const n = DOTS[level] ?? 0
  return (
    <span className={s.confidence} title={title}>
      <span className={s.dots} aria-hidden="true">
        {[1, 2, 3].map((i) => <span key={i} className={`${s.dot} ${i <= n ? s.dotOn : ''}`} />)}
      </span>
      {label ? <span>{level} confidence</span> : <span className={s.srOnly}>{level} confidence</span>}
    </span>
  )
}
