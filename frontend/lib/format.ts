export function formatLapTime(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '–:–-.–––'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const whole = Math.floor(secs)
  const ms = Math.round((secs - whole) * 1000)
  return `${mins}:${String(whole).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

export function formatDelta(seconds: number): string {
  if (!isFinite(seconds)) return '–'
  const sign = seconds >= 0 ? '+' : ''
  return `${sign}${seconds.toFixed(3)}s`
}

export function formatLaneDuration(seconds: number | null): string {
  if (seconds == null) return '–'
  return `${seconds.toFixed(1)}s`
}

export function formatSector(seconds: number | null): string {
  if (seconds == null) return '–.–––'
  return seconds.toFixed(3)
}

export function formatPosition(pos: number | null): string {
  if (pos == null) return '–'
  return `P${pos}`
}

export function formatPositionDelta(delta: number | null): string {
  if (delta == null) return '–'
  if (delta === 0) return '±0'
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta}`
}

export function formatSlope(slope: number): string {
  const sign = slope >= 0 ? '+' : ''
  return `${sign}${slope.toFixed(3)}s/lap`
}

export function formatLapNumber(lap: number | null): string {
  if (lap == null) return '–'
  return `L${lap}`
}
