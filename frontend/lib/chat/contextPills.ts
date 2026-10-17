import type { FullRaceAnalysis } from '@/types'

/**
 * The "context loaded" pills at the top of the race engineer, each shown only
 * when the analysis actually carries that data. They used to be three fixed
 * labels shown for every race. "Race ctrl parsed" is gone: /analysis exposes
 * no race-control field to check it against, so it could only ever be a claim.
 */
export function contextPills(analysis: Pick<FullRaceAnalysis, 'tyre_degradation' | 'pit_impact'>): string[] {
  const pills: string[] = []
  if (analysis.tyre_degradation.length > 0) pills.push('Tyres loaded')
  if (analysis.pit_impact.length > 0) pills.push('Pit mapped')
  return pills
}
