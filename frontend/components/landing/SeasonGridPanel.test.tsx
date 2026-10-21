// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import races2026 from '@/test/fixtures/races_2026.json'

// Block 33: a meeting's sessions in line under its row on /races.
const api = vi.hoisted(() => ({
  fetchRaces: vi.fn(),
  fetchSessions: vi.fn(),
  fetchPublished: vi.fn(),
}))
vi.mock('@/lib/api', () => api)
const openRace = vi.fn()
vi.mock('@/lib/raceNav', () => ({ useOpenRace: () => openRace }))
vi.mock('@/lib/seasons', () => ({ seasonYears: () => [2026, 2025, 2024, 2023], currentSeason: () => 2026 }))
vi.mock('@/stores/accessStore', () => ({
  useAccessStore: (pick: (s: { pro: boolean }) => unknown) => pick({ pro: true }),
}))

import { SeasonGrid } from './SeasonGrid'

const BAKU_SESSIONS = [
  { session_key: 11377, session_name: 'Race', session_type: 'Race', date_start: '2026-09-27T11:00:00Z', date_end: '2026-09-27T13:00:00Z' },
  { session_key: 11372, session_name: 'Sprint', session_type: 'Race', date_start: '2026-09-26T11:00:00Z', date_end: '2026-09-26T12:00:00Z' },
  { session_key: 11368, session_name: 'Practice 1', session_type: 'Practice', date_start: '2026-09-24T08:30:00Z', date_end: '2026-09-24T09:30:00Z' },
]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-21T12:00:00Z'))
  api.fetchRaces.mockResolvedValue(races2026)
  api.fetchSessions.mockResolvedValue(BAKU_SESSIONS)
  api.fetchPublished.mockResolvedValue({ count: 1, sessions: [{ session_key: 11377, meeting_key: 1295, year: 2026, session_name: 'Race', session_type: 'Race' }] })
  openRace.mockReset()
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

const cell = (place: string) => screen.getByText(place, { selector: 'span' }).closest('button')!

async function ready() {
  render(<SeasonGrid />)
  await screen.findByText('Baku')
  await waitFor(() => expect(within(cell('Baku')).getByText('Published')).toBeTruthy())
}

describe('/races meeting panel', () => {
  it('does not prefetch sessions; the cell says Published from /published', async () => {
    await ready()
    expect(api.fetchSessions).not.toHaveBeenCalled()
    expect(api.fetchPublished).toHaveBeenCalledWith(3000)
    expect(cell('Baku').getAttribute('aria-expanded')).toBe('false')
  })

  it('opens Baku 2026 in line: race Published with Open, sprint Processing, practice Not analysed yet', async () => {
    await ready()
    fireEvent.click(cell('Baku'))
    expect(cell('Baku').getAttribute('aria-expanded')).toBe('true')
    const panel = await screen.findByRole('region', { name: /Baku/ })
    expect(cell('Baku').getAttribute('aria-controls')).toBe(panel.id)
    await within(panel).findByText('Sprint')
    const row = (name: string) => within(panel).getByText(name).closest('li')!
    expect(within(row('Race')).getByText('Published')).toBeTruthy()
    expect(within(row('Sprint')).getByText('Processing')).toBeTruthy()
    expect(within(row('Practice 1')).getByText('Not analysed yet')).toBeTruthy()
    // Sorted by start: practice, sprint, race.
    expect(within(panel).getAllByRole('listitem').map((li) => li.firstChild!.textContent)).toEqual(['Practice 1', 'Sprint', 'Race'])
    fireEvent.click(within(row('Race')).getByRole('button', { name: 'Open analysis' }))
    expect(openRace).toHaveBeenCalledWith(11377)
  })

  it('keeps one panel open, caches per meeting, and Escape closes it back to its cell', async () => {
    await ready()
    fireEvent.click(cell('Baku'))
    await screen.findByRole('region', { name: /Baku/ })
    fireEvent.click(cell('Monaco'))
    expect(screen.queryByRole('region', { name: /Baku/ })).toBeNull()
    await screen.findByRole('region', { name: /Monaco/ })
    fireEvent.click(cell('Baku'))
    await screen.findByRole('region', { name: /Baku/ })
    expect(api.fetchSessions.mock.calls.map((c) => c[0])).toEqual([1295, 1286])
    cell('Baku').focus()
    fireEvent.keyDown(cell('Baku'), { key: 'Escape' })
    expect(screen.queryByRole('region', { name: /Baku/ })).toBeNull()
    expect(document.activeElement).toBe(cell('Baku'))
  })

  it('moves between cells with the arrow keys', async () => {
    await ready()
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-cell]'))
    buttons[0].focus()
    fireEvent.keyDown(buttons[0], { key: 'ArrowRight' })
    expect(document.activeElement).toBe(buttons[1])
    fireEvent.keyDown(buttons[1], { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(buttons[0])
  })

  it('shows a skeleton while loading, then an error with Retry that fetches again', async () => {
    let fail!: (e: Error) => void
    api.fetchSessions.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
    await ready()
    fireEvent.click(cell('Baku'))
    const panel = await screen.findByRole('region', { name: /Baku/ })
    expect(panel.getAttribute('aria-busy')).toBe('true')
    await act(async () => fail(new Error('Could not reach the API.')))
    expect(within(panel).getByRole('alert').textContent).toContain('Could not reach the API.')
    fireEvent.click(within(panel).getByRole('button', { name: 'Retry' }))
    await within(panel).findByText('Sprint')
    expect(api.fetchSessions).toHaveBeenCalledTimes(2)
  })

  it('without /published in time, cells claim neither Published nor Processing', async () => {
    api.fetchPublished.mockResolvedValue(null)
    render(<SeasonGrid />)
    await screen.findByText('Baku')
    await waitFor(() => expect(within(cell('Baku')).getByText('Sessions')).toBeTruthy())
    expect(screen.queryByText('Published')).toBeNull()
    expect(screen.queryByText('Processing')).toBeNull()
  })

  it('a cancelled meeting has no panel to open', async () => {
    await ready()
    const bahrain = screen.getByText('Bahrain', { selector: 'span' }).parentElement!
    expect(bahrain.closest('button')).toBeNull()
  })
})
