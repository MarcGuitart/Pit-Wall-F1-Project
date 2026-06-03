export type SessionType = 'Race' | 'Qualifying' | 'Practice'

/**
 * Derive a canonical session type from the OpenF1 session_name string.
 * session_name values seen in the wild: "Race", "Sprint", "Qualifying",
 * "Sprint Shootout", "Practice 1", "Practice 2", "Practice 3".
 */
export function getSessionType(sessionName: string): SessionType {
  const s = sessionName.toLowerCase()
  if (s.includes('race') || s.includes('sprint')) return 'Race'
  if (
    s.includes('qual') ||
    s.includes('shootout') ||
    s === 'q1' || s === 'q2' || s === 'q3'
  )
    return 'Qualifying'
  return 'Practice'
}
