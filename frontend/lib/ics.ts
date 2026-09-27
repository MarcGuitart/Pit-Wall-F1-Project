/**
 * A downloadable .ics file (RFC 5545) for one F1 session. No external service,
 * no Google Calendar API — the file is built entirely client-side and handed
 * to the browser as a download.
 *
 * Deliberately not general-purpose: one event per file, times are given in
 * UTC ("Z" form) rather than building a VTIMEZONE block, which every mainstream
 * calendar app (Google, Outlook, Apple) resolves to the viewer's local time
 * correctly on its own — that is what "Z" means, and it is far simpler than
 * shipping timezone rules by hand.
 */

/**
 * Escape TEXT-valued fields per RFC 5545 §3.3.11: backslash, semicolon and
 * comma are escaped, and a literal newline becomes the two characters \n.
 * Order matters — the backslash must be escaped first, or the escapes added
 * for the other characters would themselves be re-escaped.
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/**
 * Fold a content line at 75 octets, as RFC 5545 §3.1 requires: a folded line
 * is broken with CRLF followed by a single space, and the space is not part of
 * the content. This counts UTF-16 code units, not UTF-8 octets — close enough
 * for the ASCII-heavy content this file ever builds (race and circuit names),
 * and never wrong in a way that breaks parsing: under-folding a line is legal
 * (any RFC 5545 parser must accept an unfolded line), so erring toward fewer
 * fold points here is always safe, never invalid.
 */
export function foldIcsLine(line: string): string {
  const LIMIT = 75
  if (line.length <= LIMIT) return line
  const parts: string[] = []
  let rest = line
  let first = true
  while (rest.length > 0) {
    const width = first ? LIMIT : LIMIT - 1 // continuation lines lose one column to the leading space
    parts.push(rest.slice(0, width))
    rest = rest.slice(width)
    first = false
  }
  return parts.join('\r\n ')
}

/** "2026-09-26T11:00:00+00:00" or "...Z" -> "20260926T110000Z". Throws on an
 *  unparsable date rather than emitting a corrupt DTSTART/DTEND. */
export function formatIcsUtc(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) throw new Error(`not a valid date: ${iso}`)
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

export type IcsEventInput = {
  /** Stable across regenerations of the same session, so a calendar app that
   *  already has it updates in place instead of duplicating it. */
  uid: string
  summary: string
  description?: string
  location?: string
  /** ISO 8601, any offset — converted to UTC. */
  dateStart: string
  /** ISO 8601. Required: RFC 5545 wants either DTEND or DURATION, and a
   *  missing end is exactly the kind of estimate this file should not invent
   *  silently — the caller supplies a real or explicitly-estimated end. */
  dateEnd: string
  /** Defaults to dateStart; when the event is generated matters less than
   *  when the session is, and a fixed value keeps output deterministic for
   *  testing. */
  dtstamp?: string
}

/** One VCALENDAR, one VEVENT, CRLF line endings throughout as the RFC requires. */
export function buildSessionIcs(input: IcsEventInput): string {
  const dtstamp = formatIcsUtc(input.dtstamp ?? input.dateStart)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pit Wall IQ//Race Calendar//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(input.uid)}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${formatIcsUtc(input.dateStart)}`,
    `DTEND:${formatIcsUtc(input.dateEnd)}`,
    `SUMMARY:${escapeIcsText(input.summary)}`,
    ...(input.description ? [`DESCRIPTION:${escapeIcsText(input.description)}`] : []),
    ...(input.location ? [`LOCATION:${escapeIcsText(input.location)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  // \r\n between lines, and a trailing \r\n — RFC 5545 §3.1 requires every
  // content line, including the last, to be CRLF-terminated.
  return lines.map(foldIcsLine).join('\r\n') + '\r\n'
}

/** A filesystem-safe name for the download — letters, digits, space, dash. */
export function icsFilename(summary: string): string {
  const safe = summary.replace(/[^a-zA-Z0-9 -]/g, '').trim().replace(/\s+/g, '-')
  return `${safe || 'session'}.ics`
}

/** Browser-only: hands the file to the visitor as a download. Not unit-tested
 *  here — it is a thin DOM shim around buildSessionIcs, which is. */
export function downloadIcs(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
