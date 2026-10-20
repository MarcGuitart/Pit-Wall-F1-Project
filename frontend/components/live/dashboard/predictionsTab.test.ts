import { describe, expect, it } from 'vitest'
import type { LiveSnapshot } from '@/types/live'
import { liveTabs } from './LiveDashboard'
import { buildLiveDigest } from '@/lib/liveContext'

/**
 * Block 32 addendum: the Predictions tab exists only while the live server
 * sends a projection (block 35 switches it off by default), with no empty
 * state; and the engineer's context never carries a probability.
 */
const projection = {
  kind: 'race', confidence: 'Low', simulations: 600, total_laps: 51, total_laps_source: 'calendar',
  drivers: [{ code: 'RUS', position: 1, win: 0.93, podium: 0.99, projected_position: 1, stops_owed: 0 }],
}

describe('Predictions tab', () => {
  it('is there with a projection', () => {
    expect(liveTabs({ projection } as unknown as LiveSnapshot).map((t) => t.id)).toContain('predict')
  })

  it('does not exist without one', () => {
    const ids = liveTabs({ projection: undefined } as unknown as LiveSnapshot).map((t) => t.id)
    expect(ids).not.toContain('predict')
    expect(ids).toContain('timing')
  })
})

describe('engineer context', () => {
  it('has no probability even when the snapshot carries a projection', () => {
    const snap = {
      profile: 'race', session_name: 'Race', location: 'Baku', generated_at: '2026-09-26T12:00:00Z',
      track_status: { flag: 'GREEN', source: 'race_control' }, chequered: false, current_lap: 49, race_distance: 51,
      tower: [], practice_tower: [], notes: [], pit_watch: [], dashboard: null, projection,
    } as unknown as LiveSnapshot
    const { context } = buildLiveDigest(snap, null)
    expect(context).not.toMatch(/PROJECTION|\bwin\b|\bpole\b|podium|probab|odds|%/i)
  })
})
