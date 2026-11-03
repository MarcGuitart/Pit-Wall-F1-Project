// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import races2026 from '@/test/fixtures/races_2026.json'

// Block 50: the top bar and the season grid during the open week, with no token on this browser.
const api = vi.hoisted(() => ({
  fetchOpenAccess: vi.fn(),
  fetchRaces: vi.fn(async () => races2026),
  fetchSessions: vi.fn(async () => []),
  fetchPublished: vi.fn(async () => null),
  fetchPromo: vi.fn(),
  redeemAccessCode: vi.fn(),
}))
vi.mock('@/lib/api', () => api)
vi.mock('@/stores/accessStore', () => ({
  useAccessStore: (pick: (s: { pro: boolean; showBadge: boolean; expiresAt: null }) => unknown) => pick({ pro: false, showBadge: true, expiresAt: null }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }), usePathname: () => '/races' }))
vi.mock('@/lib/raceNav', () => ({ useOpenRace: () => vi.fn(), useNavigateWithSweep: () => vi.fn() }))
vi.mock('@/lib/seasons', async (orig) => ({ ...(await orig<typeof import('@/lib/seasons')>()), seasonYears: () => [2026, 2025, 2024, 2023], currentSeason: () => 2026 }))
vi.mock('@/lib/liveStatus', async (orig) => ({
  ...(await orig<typeof import('@/lib/liveStatus')>()),
  fetchLiveServerStatus: vi.fn(async () => ({ reachable: false, sessionKey: null })),
  fetchNextLiveSession: vi.fn(async () => null),
}))

import { TopBar } from './TopBar'
import { SeasonGrid } from '@/components/landing/SeasonGrid'
import { __resetOpenAccessForTests, loadOpenAccess } from '@/lib/openAccess'
import { __resetLiveStatusForTests } from '@/hooks/useLiveStatus'

const UNTIL = '2026-11-03T10:00:00+01:00'

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-11-03T08:58:00Z'))
  __resetOpenAccessForTests()
  __resetLiveStatusForTests()
})
afterEach(() => { cleanup(); vi.useRealTimers() })

async function week(open: boolean) {
  api.fetchOpenAccess.mockResolvedValue(open ? { open: true, until: UNTIL, answered: true } : { open: false, until: null, answered: true })
  await act(async () => { await loadOpenAccess() })
}

describe('top bar', () => {
  // The open week's line left the top bar for the promo banner (OpenWeekBanner.tsx); the week, if ever set,
  // still opens every PRO feature in the interface.
  it('the week drops the "Live PRO" wall, with no line of its own in the bar', async () => {
    await week(true)
    render(<TopBar />)
    expect(screen.queryByText(/Open week/)).toBeNull()
    expect(screen.queryByLabelText(/Live PRO/)).toBeNull()
  })

  it('the wall is back by itself at 10:00 CET', async () => {
    await week(true)
    render(<TopBar />)
    await act(async () => { vi.advanceTimersByTime(2 * 60_000) })
    expect(screen.getByLabelText(/Live PRO/)).toBeTruthy()
  })

  it('closed (or no variable on the API): exactly as before', async () => {
    await week(false)
    render(<TopBar />)
    expect(screen.queryByText(/Open week/)).toBeNull()
    expect(screen.getByLabelText(/Live PRO/)).toBeTruthy()
  })
})

describe('season grid', () => {
  it('open: it opens on 2026, not locked', async () => {
    await week(true)
    render(<SeasonGrid />)
    await screen.findByText('Kuala Lumpur')
    expect(screen.getByText('Pick a race for the full analysis')).toBeTruthy()
    expect(screen.queryByText(/PRO season: enter an access code/)).toBeNull()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/2026/)   // opens on the current season
  })

  it('closed: it opens on a free season, as today', async () => {
    await week(false)
    render(<SeasonGrid />)
    await screen.findByText('Kuala Lumpur')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/2024/)
  })
})
