// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import * as liveStatus from '@/lib/liveStatus'
import { usePendingRace } from '@/lib/raceNav'
import { resetLoadClock } from '@/lib/loadPhase'

let pathname = '/'
vi.mock('next/navigation', () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn() }) }))

import { AppShell } from './AppShell'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-16T12:00:00Z'))
  vi.spyOn(liveStatus, 'fetchLiveServerStatus').mockResolvedValue({ reachable: false, sessionKey: null })
  vi.spyOn(liveStatus, 'fetchNextLiveSession').mockResolvedValue(null)
  usePendingRace.setState({ pending: null })
  resetLoadClock(9636)
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('AppShell while a clicked race is on its way', () => {
  it('replaces the old page with the analysis loader (after the 300 ms grace)', async () => {
    pathname = '/'
    render(<AppShell><p>landing content</p></AppShell>)
    act(() => { usePendingRace.getState().set({ href: '/race/9636', key: 9636 }) })
    expect(screen.queryByText('landing content')).toBeNull()
    // The loader is loaded on demand (next/dynamic): let the import land.
    await act(async () => { await vi.dynamicImportSettled() })
    act(() => { vi.advanceTimersByTime(300) })
    expect(screen.getByText('Loading analysis')).toBeTruthy()
  })

  it('lets the race page through, and clears the pending state, once the route arrives', () => {
    usePendingRace.setState({ pending: { href: '/race/9636', key: 9636 } })
    pathname = '/race/9636'
    render(<AppShell><p>race page</p></AppShell>)
    expect(screen.getByText('race page')).toBeTruthy()
    expect(usePendingRace.getState().pending).toBeNull()
  })

  it('shows the page as usual with nothing pending', () => {
    pathname = '/docs'
    render(<AppShell><p>docs</p></AppShell>)
    expect(screen.getByText('docs')).toBeTruthy()
  })
})
