'use client'

/**
 * A small "Add to calendar" control that hands the browser a .ics file.
 * No external service — RFC 5545 built entirely client-side (lib/ics.ts).
 */
import { buildSessionIcs, downloadIcs, icsFilename, type IcsEventInput } from '@/lib/ics'

type AddToCalendarButtonProps = {
  event: IcsEventInput
  /** Compact renders as a small icon-only button for tight spaces (session pills). */
  compact?: boolean
  className?: string
}

export function AddToCalendarButton({ event, compact = false, className = '' }: AddToCalendarButtonProps) {
  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    downloadIcs(icsFilename(event.summary), buildSessionIcs(event))
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleClick}
        title={`Add "${event.summary}" to your calendar`}
        aria-label={`Add ${event.summary} to calendar`}
        className={`inline-flex items-center justify-center w-4 h-4 rounded-[2px] border border-border-default
                    text-text-muted hover:text-signal-blue hover:border-signal-blue transition-colors ${className}`}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="12" y1="14" x2="12" y2="18" />
          <line x1="10" y1="16" x2="14" y2="16" />
        </svg>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-[3px] border border-border-default
                  text-text-muted hover:text-signal-blue hover:border-signal-blue transition-colors
                  font-mono text-[9px] uppercase tracking-[0.5px] ${className}`}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="12" y1="14" x2="12" y2="18" />
        <line x1="10" y1="16" x2="14" y2="16" />
      </svg>
      Add to calendar
    </button>
  )
}
