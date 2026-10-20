import { formatIcsUtc, type IcsEventInput } from '@/lib/ics'

/**
 * "Add to calendar" (block 32, task 5): Google Calendar by URL, and Apple or
 * Outlook by an .ics file. Nothing is sent anywhere and nothing reminds anyone:
 * the event goes into the visitor's own calendar.
 *
 * The .ics is built in the browser (lib/ics.ts) until the API serves
 * GET /sessions/{key}/calendar.ics (block 33). Flip ICS_FROM_API then; events
 * without a session key keep the browser-built file.
 */
export const ICS_FROM_API = false

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

/** The event's end is the session's date_end, never an estimate. */
export function googleCalendarUrl({ summary, description, location, dateStart, dateEnd }: IcsEventInput): string {
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: summary,
    dates: `${formatIcsUtc(dateStart)}/${formatIcsUtc(dateEnd)}`,
    details: description ?? '',
    location: location ?? '',
  })
  return `https://calendar.google.com/calendar/render?${q.toString()}`
}

/** Where the .ics comes from: the API once it serves it, otherwise null (build it here). */
export function icsUrl(sessionKey: number | undefined, fromApi: boolean = ICS_FROM_API): string | null {
  return fromApi && sessionKey != null ? `${API_URL}/sessions/${sessionKey}/calendar.ics` : null
}
