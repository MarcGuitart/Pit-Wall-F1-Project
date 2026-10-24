'use client'

/**
 * "Add to calendar" (block 32, task 5): a small menu (ui/Popover) with Google
 * Calendar, which opens calendar.google.com in a new tab with the event filled
 * in, and Apple or Outlook, an .ics file — built here in the browser until the
 * API serves it (lib/calendar.ts, ICS_FROM_API). The event ends at the
 * session's date_end. It puts the session in the visitor's own calendar and
 * promises nothing else: no reminders, no notifications from this site.
 */
import { useState } from 'react'
import { buildSessionIcs, downloadIcs, icsFilename, type IcsEventInput } from '@/lib/ics'
import { googleCalendarUrl, icsUrl } from '@/lib/calendar'
import { Popover } from './Popover'
import ui from './ui.module.css'

type AddToCalendarButtonProps = {
  event: IcsEventInput
  /** The session, when the event is one: lets the .ics come from the API once it serves it. */
  sessionKey?: number
  /** Compact renders an icon-only trigger for tight spaces (session pills). */
  compact?: boolean
  className?: string
  /**
   * 'system': the design system's button (the migrated pages). 'classic' stays
   * the original look for /live (NotLiveYet), which is not part of the migration.
   */
  variant?: 'classic' | 'system'
}

const CalendarIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
)

export function AddToCalendarButton({ event, sessionKey, compact = false, className = '', variant = 'classic' }: AddToCalendarButtonProps) {
  const system = variant === 'system'
  const triggerClassName = system
    ? `${ui.btn} ${className}`
    : `inline-flex items-center gap-1.5 px-2 py-1 rounded-[3px] border border-border-default text-text-muted hover:text-signal-blue hover:border-signal-blue transition-colors font-mono text-[length:var(--pw-text-xs)] uppercase tracking-[0.5px] ${className}`
  const fromApi = icsUrl(sessionKey)
  const [icsFailed, setIcsFailed] = useState(false)
  const [fetching, setFetching] = useState(false)
  const download = (e: React.MouseEvent) => {
    e.stopPropagation()
    downloadIcs(icsFilename(event.summary), buildSessionIcs(event))
  }
  // The API's file is fetched rather than linked, so an API without
  // calendar.ics (an older deploy) is said here instead of opening an error
  // page; Google Calendar stays on offer either way.
  const downloadFromApi = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!fromApi) return
    setIcsFailed(false)
    setFetching(true)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    try {
      const res = await fetch(fromApi, { signal: ctrl.signal })
      const text = res.ok ? await res.text() : ''
      if (!text.startsWith('BEGIN:VCALENDAR')) throw new Error('not a calendar file')
      downloadIcs(icsFilename(event.summary), text)
    } catch {
      setIcsFailed(true)
    } finally {
      clearTimeout(timer)
      setFetching(false)
    }
  }

  return (
    <Popover
      trigger={compact ? <CalendarIcon size={12} /> : <><CalendarIcon size={12} />Add to calendar</>}
      triggerLabel={`Add to calendar: ${event.summary}`}
      triggerClassName={triggerClassName}
      title="Add to calendar"
      align="left"
    >
      <div style={{ display: 'grid', gap: 8 }}>
        <a className={ui.btn} href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          Google Calendar
        </a>
        {fromApi
          ? <button type="button" className={ui.btn} onClick={downloadFromApi} disabled={fetching}>Apple or Outlook (.ics)</button>
          : <button type="button" className={ui.btn} onClick={download}>Apple or Outlook (.ics)</button>}
        <p role="status" aria-live="polite" style={{ margin: 0, fontSize: 12 }}>
          {icsFailed ? 'Calendar file is not available right now' : ''}
        </p>
      </div>
    </Popover>
  )
}
