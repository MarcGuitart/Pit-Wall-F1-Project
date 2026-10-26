// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, renderHook, screen } from '@testing-library/react'

const api = vi.hoisted(() => ({ fetchOpenAccess: vi.fn(), fetchAccessStatus: vi.fn(async () => ({ pro: false })) }))
vi.mock('@/lib/api', () => api)
const access = vi.hoisted(() => ({ pro: false }))
vi.mock('@/stores/accessStore', () => ({ useAccessStore: (pick: (s: { pro: boolean }) => unknown) => pick({ pro: access.pro }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }), usePathname: () => '/' }))

import { REFRESH_MS, __resetOpenAccessForTests, formatUntil, loadOpenAccess, refreshOpenAccessIfStale, useHasAccess, useOpenAccess } from './openAccess'
import { MeetingPanel } from '@/components/landing/MeetingPanel'

const UNTIL = '2026-11-03T10:00:00+01:00'
const BEFORE = new Date('2026-11-03T08:59:00Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(BEFORE)
  __resetOpenAccessForTests()
  api.fetchOpenAccess.mockReset()
  access.pro = false
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('the open week (block 50)', () => {
  it('formats the end as the top bar says it: "Tue 3 Nov, 10:00 CET"', () => {
    expect(formatUntil(UNTIL)).toBe('Tue 3 Nov, 10:00 CET')
    expect(formatUntil('2026-07-03T10:00:00+02:00')).toBe('Fri 3 Jul, 10:00 CEST')
  })

  it('before the date it is open, and it closes by itself at the date', async () => {
    api.fetchOpenAccess.mockResolvedValue({ open: true, until: UNTIL })
    await act(async () => { await loadOpenAccess() })
    expect(useOpenAccess.getState().open).toBe(true)
    act(() => { vi.advanceTimersByTime(59_000) })
    expect(useOpenAccess.getState().open).toBe(true)
    act(() => { vi.advanceTimersByTime(1_000) })                     // 10:00 CET
    expect(useOpenAccess.getState().open).toBe(false)
  })

  it('after the date it stays closed even if an old answer still says open', async () => {
    vi.setSystemTime(new Date('2026-11-03T09:00:01Z'))
    api.fetchOpenAccess.mockResolvedValue({ open: true, until: UNTIL })
    await act(async () => { await loadOpenAccess() })
    expect(useOpenAccess.getState().open).toBe(false)
  })

  it('no answer, or no variable on the API: closed, everything as today', async () => {
    api.fetchOpenAccess.mockResolvedValue({ open: false, until: null })
    await act(async () => { await loadOpenAccess() })
    expect(useOpenAccess.getState()).toMatchObject({ open: false, until: null })
    const { result } = renderHook(() => useHasAccess())
    expect(result.current).toBe(false)
  })

  it('a tab coming back after 10 minutes asks again (a week extended or closed on Render reaches it)', async () => {
    api.fetchOpenAccess.mockResolvedValue({ open: true, until: UNTIL })
    await act(async () => { await loadOpenAccess() })
    refreshOpenAccessIfStale()
    expect(api.fetchOpenAccess).toHaveBeenCalledTimes(1)
    vi.setSystemTime(new Date(BEFORE.getTime() + REFRESH_MS + 1))
    api.fetchOpenAccess.mockResolvedValue({ open: false, until: UNTIL })   // closed early on Render
    await act(async () => { refreshOpenAccessIfStale(); await Promise.resolve() })
    expect(api.fetchOpenAccess).toHaveBeenCalledTimes(2)
  })

  it('useHasAccess: a token or the open week', () => {
    useOpenAccess.setState({ open: true, until: UNTIL })
    expect(renderHook(() => useHasAccess()).result.current).toBe(true)
    useOpenAccess.setState({ open: false })
    access.pro = true
    expect(renderHook(() => useHasAccess()).result.current).toBe(true)
  })

  it('no PRO chip on 2026 sessions while the week is open', () => {
    const props = {
      id: 'p', cellId: 'c', place: 'Austin', gpName: 'United States Grand Prix', onRetry: () => {}, onOpen: () => {},
      ctx: { published: new Set<number>(), now: BEFORE.getTime(), season: 2026, currentSeason: 2026, locked: false },
      data: { status: 'ready' as const, sessions: [{ session_key: 11396, session_name: 'Race', session_type: 'Race', date_start: '2026-10-25T19:00:00Z', date_end: '2026-10-25T21:00:00Z', is_cancelled: false }] },
    }
    const { rerender } = render(<MeetingPanel {...props} />)
    expect(screen.queryByText('PRO')).not.toBeNull()
    act(() => { useOpenAccess.setState({ open: true, until: UNTIL }) })
    rerender(<MeetingPanel {...props} />)
    expect(screen.queryByText('PRO')).toBeNull()
  })
})
