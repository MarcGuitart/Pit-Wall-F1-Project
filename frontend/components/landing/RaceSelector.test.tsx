// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import races2026 from '@/test/fixtures/races_2026.json'
import jeddahSessions from '@/test/fixtures/sessions_1283.json'
import type { SessionInfo } from '@/types'

// /races/1283/sessions as the backend answers it since Block 26d, recorded
// from ops/races-meta: every Jeddah 2026 session is is_cancelled: true.
let sessions: SessionInfo[] = jeddahSessions
vi.mock('@/lib/api', () => ({
  fetchRaces: vi.fn(async () => races2026),
  fetchSessions: vi.fn(async () => sessions),
}))
vi.mock('@/lib/raceNav', () => ({ useOpenRace: () => vi.fn() }))

import { RaceSelector } from './RaceSelector'

beforeEach(() => {
  sessions = jeddahSessions
  // The week before the race weekend, so every session is in the future and
  // would get an .ics button if it were not cancelled. Only Date is faked:
  // the selector's debounces run on real timers.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-04-10T12:00:00Z'))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function openJeddah() {
  render(<RaceSelector />)
  const gp = await screen.findByRole('combobox', { name: /Grand Prix/ }, { timeout: 3000 })
  await vi.waitFor(() => expect(gp.hasAttribute('disabled')).toBe(false), { timeout: 3000 })
  fireEvent.click(gp)
  fireEvent.click(await screen.findByRole('option', { name: /^Jeddah/ }))
  return screen.findByRole('group', { name: /Session/ }, { timeout: 3000 })
}

describe('RaceSelector with cancelled sessions', () => {
  it('disables every cancelled session, labelled Cancelled, with no .ics', async () => {
    const group = await openJeddah()
    const pills = await within(group).findAllByRole('button', { name: /cancelled/i }, { timeout: 3000 })
    expect(pills).toHaveLength(5)
    for (const b of pills) {
      expect((b as HTMLButtonElement).disabled).toBe(true)
      expect(b.textContent).toMatch(/· Cancelled$/)
      expect(b.closest('a')).toBeNull()
    }
    expect(within(group).queryByRole('button', { name: /to calendar/ })).toBeNull()
    expect(within(group).queryByRole('link')).toBeNull()
    // Nothing selected by default, so there is nothing to analyse.
    expect((screen.getByRole('button', { name: /Analyze Race/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('a session that is not cancelled keeps its button, its .ics and the default pick', async () => {
    sessions = jeddahSessions.map((s) => (s.session_name === 'Race' ? { ...s, is_cancelled: false } : s))
    const group = await openJeddah()
    const race = await within(group).findByRole('button', { name: 'Race' }, { timeout: 3000 })
    expect((race as HTMLButtonElement).disabled).toBe(false)
    expect(race.getAttribute('aria-pressed')).toBe('true')
    expect(within(group).getAllByRole('button', { name: /cancelled/i })).toHaveLength(4)
    // Exactly one calendar control, and it is the race's.
    const ics = within(group).getAllByRole('button', { name: /to calendar/ })
    expect(ics).toHaveLength(1)
    expect(ics[0].getAttribute('aria-label')).toContain('Race')
    for (const off of Array.from(group.querySelectorAll('[data-cancelled="true"]'))) {
      expect(off.querySelectorAll('button')).toHaveLength(1)
    }
  })
})
