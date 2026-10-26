/**
 * A Grand Prix weekend as the season grid shows it (block 43):
 * "29 Feb to 2 Mar 2024", "6 to 8 Dec 2024", or — when the backend has no end
 * (date_end null or an older backend) — the first day with its year,
 * "29 Feb 2024". UTC calendar days, so every visitor reads the same dates.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function weekendLabel(start: string, end?: string | null): string {
  const a = new Date(start)
  if (Number.isNaN(a.getTime())) return ''
  const day = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
  const b = end ? new Date(end) : null
  if (!b || Number.isNaN(b.getTime()) || b.getTime() < a.getTime()) return `${day(a)} ${a.getUTCFullYear()}`
  const sameDay = a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate()
  if (sameDay) return `${day(a)} ${a.getUTCFullYear()}`
  if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${day(a)} ${a.getUTCFullYear()} to ${day(b)} ${b.getUTCFullYear()}`
  if (a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()} to ${day(b)} ${b.getUTCFullYear()}`
  return `${day(a)} to ${day(b)} ${b.getUTCFullYear()}`
}
