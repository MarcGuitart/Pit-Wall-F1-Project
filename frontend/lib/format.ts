export function formatLapTime(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return 'n/a'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const whole = Math.floor(secs)
  const ms = Math.round((secs - whole) * 1000)
  return `${mins}:${String(whole).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

export function formatDelta(seconds: number): string {
  if (!isFinite(seconds)) return 'n/a'
  const sign = seconds >= 0 ? '+' : ''
  return `${sign}${seconds.toFixed(3)}s`
}

export function formatLaneDuration(seconds: number | null): string {
  if (seconds == null) return 'n/a'
  return `${seconds.toFixed(1)}s`
}

export function formatSector(seconds: number | null): string {
  if (seconds == null) return 'n/a'
  return seconds.toFixed(3)
}

export function formatPosition(pos: number | null): string {
  if (pos == null) return 'n/a'
  return `P${pos}`
}

export function formatPositionDelta(delta: number | null): string {
  if (delta == null) return 'n/a'
  if (delta === 0) return '±0'
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta}`
}

export function formatSlope(slope: number): string {
  return `${formatSignedSlope(slope)}s/lap`
}

/** A degradation slope with its own sign: "+0.079", "-0.011", never "+-0.011". */
export function formatSignedSlope(slope: number): string {
  const sign = slope >= 0 ? '+' : ''
  return `${sign}${slope.toFixed(3)}`
}

export function formatLapNumber(lap: number | null): string {
  if (lap == null) return 'n/a'
  return `L${lap}`
}

/**
 * A session's start, in whoever is reading it's own timezone — never a fixed
 * UTC offset baked into the copy. `Intl`/`Date` read the browser's timezone by
 * default, so passing no `timeZone` is the correct call, not an omission.
 */
export function formatLocalDateTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'n/a'
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** The same instant, explicitly in UTC — for "ends at" alongside a local time,
 *  so both are unambiguous without asking the reader to do the conversion. */
export function formatUtcTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'n/a'
  return (
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
  )
}

/** A redeemed token's expiry, as a short date — "27 Oct 2026". null input or
 *  output means "no expiry to show", not an error. */
export function formatExpiry(epochSeconds: number | null): string | null {
  if (!epochSeconds) return null
  return new Date(epochSeconds * 1000).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
