// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import races2026 from '@/test/fixtures/races_2026.json'

// /races?year=2026 as the backend answers it since Block 26d (location and
// is_cancelled), recorded from ops/races-meta. Sakhir (1282) and Jeddah (1283)
// are cancelled; Kuala Lumpur (1308) is OpenF1's "Bahrain Grand Prix".
vi.mock('@/lib/api', () => ({
  fetchRaces: vi.fn(async () => races2026),
  fetchSessions: vi.fn(async () => []),
}))
vi.mock('@/lib/raceNav', () => ({ useOpenRace: () => vi.fn() }))
vi.mock('@/lib/seasons', () => ({ seasonYears: () => [2026, 2025, 2024, 2023] }))
vi.mock('@/stores/accessStore', () => ({
  useAccessStore: (pick: (s: { pro: boolean }) => unknown) => pick({ pro: true }),
}))

import { SeasonGrid } from './SeasonGrid'

afterEach(cleanup)

async function grid() {
  render(<SeasonGrid />)
  return screen.findByText('Kuala Lumpur')
}

function cellOf(place: string) {
  return screen.getByText(place, { selector: 'span' }).parentElement!
}

describe('SeasonGrid with /races carrying location and is_cancelled', () => {
  it('shows Sakhir and Jeddah as Cancelled, with nothing to click', async () => {
    await grid()
    for (const place of ['Sakhir', 'Jeddah']) {
      const cell = cellOf(place)
      expect(cell.tagName).toBe('DIV')
      expect(cell.closest('a, button')).toBeNull()
      expect(within(cell).getByText('Cancelled')).toBeTruthy()
      expect(within(cell).queryByText(/Round/)).toBeNull()
    }
  })

  it('numbers rounds without the cancelled meetings', async () => {
    await grid()
    const fixture = races2026 as { meeting_name: string; is_cancelled: boolean }[]
    const gps = fixture.filter((r) => !/pre-?season|testing/i.test(r.meeting_name))
    const live = gps.filter((r) => !r.is_cancelled).length
    expect(screen.getByText(`${live} grands prix · 2 cancelled`, { exact: false })).toBeTruthy()
    const rounds = screen.getAllByText(/^Round \d\d ·/).map((n) => Number(n.textContent!.slice(6, 8)))
    expect(rounds).toEqual(Array.from({ length: live }, (_, i) => i + 1))
    // Melbourne, Shanghai, Suzuka; Sakhir and Jeddah do not take rounds 4 and 5.
    expect(within(cellOf('Suzuka')).getByText(/^Round 03 ·/)).toBeTruthy()
    expect(within(cellOf('Miami Gardens')).getByText(/^Round 04 ·/)).toBeTruthy()
  })

  it('names the meeting by location: Kuala Lumpur, not Bahrain', async () => {
    await grid()
    expect(cellOf('Kuala Lumpur').tagName).toBe('BUTTON')
    expect(screen.queryByText('Bahrain')).toBeNull()
  })
})
