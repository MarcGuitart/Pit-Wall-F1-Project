// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TopBar } from './TopBar'
import { useAccessStore } from '@/stores/accessStore'
import * as liveStatus from '@/lib/liveStatus'

/**
 * The TopBar PRO indicator: shown only when both a valid token and the
 * display preference say so, on more than one route (it is the same
 * component everywhere — race and live pages pass their own breadcrumb, the
 * home page passes none — so this exercises it with two different props,
 * standing in for "a page that is not the home page").
 */

function resetStore() {
  useAccessStore.setState({
    pro: false, expiresAt: null, redemptionAvailable: false, checked: false, showBadge: true,
  })
}

beforeEach(() => {
  resetStore()
  // Safe default for every test that doesn't care about the Live pill
  // specifically: no live session, nothing scheduled — so a test that merely
  // sets pro:true (for the PRO badge) never makes a real network call.
  vi.spyOn(liveStatus, 'fetchLiveServerStatus').mockResolvedValue({ reachable: false, sessionKey: null })
  vi.spyOn(liveStatus, 'fetchNextLiveSession').mockResolvedValue(null)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('no breadcrumb (the home page)', () => {
  it('shows nothing when there is no PRO access — not even a "Free" label', () => {
    render(<TopBar />)
    expect(screen.queryByLabelText(/PRO access active/i)).toBeNull()
    expect(screen.queryByText('Free')).toBeNull()
  })

  it('shows the PRO badge once the store says pro:true', () => {
    useAccessStore.setState({ pro: true, showBadge: true })
    render(<TopBar />)
    expect(screen.getByLabelText(/PRO access active/i)).toBeTruthy()
    expect(screen.getByText('PRO')).toBeTruthy()
  })
})

describe('with a breadcrumb (a race or live page)', () => {
  const breadcrumb = [{ label: '2026', href: '/' }, { label: 'Baku' }]

  it('shows nothing without PRO access, same as the home page', () => {
    render(<TopBar breadcrumb={breadcrumb} />)
    expect(screen.queryByLabelText(/PRO access active/i)).toBeNull()
  })

  it('shows the PRO badge with PRO access — the indicator is not home-only', () => {
    useAccessStore.setState({ pro: true, showBadge: true })
    render(<TopBar breadcrumb={breadcrumb} />)
    expect(screen.getByLabelText(/PRO access active/i)).toBeTruthy()
    // and the breadcrumb this page actually needed still renders alongside it
    expect(screen.getByText('Baku')).toBeTruthy()
  })
})

describe('the display preference', () => {
  it('a valid token with the badge hidden shows nothing in the TopBar', () => {
    useAccessStore.setState({ pro: true, showBadge: false })
    render(<TopBar />)
    expect(screen.queryByLabelText(/PRO access active/i)).toBeNull()
  })

  it('an expired/absent token never shows the badge even if showBadge is true', () => {
    useAccessStore.setState({ pro: false, showBadge: true })
    render(<TopBar />)
    expect(screen.queryByLabelText(/PRO access active/i)).toBeNull()
  })
})

describe('the badge links to Settings', () => {
  it('points at /settings', () => {
    useAccessStore.setState({ pro: true, showBadge: true })
    render(<TopBar />)
    const link = screen.getByLabelText(/PRO access active/i) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/settings')
  })
})

/**
 * The Live pill (Block 22, fixing Block 20's own finding #3): the old copy
 * unconditionally said "Real-time is not available yet" even though
 * /live/[sessionKey] has worked for PRO visitors since Block 15.
 */
describe('the Live pill — a PRO visitor with a session actually live', () => {
  it('is a real link to /live/[sessionKey], verified against the live server', async () => {
    vi.spyOn(liveStatus, 'fetchLiveServerStatus').mockResolvedValue({ reachable: true, sessionKey: 11377 })
    useAccessStore.setState({ pro: true, showBadge: true })
    render(<TopBar />)

    const link = await screen.findByRole('link', { name: /^Live$/ })
    expect(link.getAttribute('href')).toBe('/live/11377')
  })
})

describe('the Live pill — PRO but nothing live right now', () => {
  it('never claims live mode does not exist', async () => {
    useAccessStore.setState({ pro: true, showBadge: true })
    render(<TopBar />)
    await screen.findByLabelText(/no session live right now/i)
    expect(screen.queryByText(/not available yet/i)).toBeNull()
  })

  it('shows the next scheduled session by name and date, reusing Block 19\'s lookup', async () => {
    vi.spyOn(liveStatus, 'fetchNextLiveSession').mockResolvedValue({
      meetingName: 'Bahrain Grand Prix',
      circuitShortName: 'Sakhir',
      sessionName: 'Race',
      dateStart: '2026-10-02T04:30:00Z',
      dateEnd: '2026-10-02T06:30:00Z',
    })
    useAccessStore.setState({ pro: true, showBadge: true })
    render(<TopBar />)

    const pill = await screen.findByLabelText(/no session live right now/i)
    fireEvent.mouseEnter(pill)
    expect(await screen.findByText(/Next live session: Bahrain Grand Prix Race/i)).toBeTruthy()
  })

  it('says explicitly when nothing is scheduled, rather than going blank', async () => {
    vi.spyOn(liveStatus, 'fetchNextLiveSession').mockResolvedValue(null)
    useAccessStore.setState({ pro: true, showBadge: true })
    render(<TopBar />)

    const pill = await screen.findByLabelText(/no session live right now/i)
    fireEvent.mouseEnter(pill)
    expect(await screen.findByText(/No upcoming session is scheduled/i)).toBeTruthy()
  })
})

describe('the Live pill — no PRO access', () => {
  it('invites to Settings instead of saying live mode is not available', () => {
    render(<TopBar />) // resetStore() already set pro:false
    const link = screen.getByLabelText(/PRO, open Settings/i) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/settings')
    expect(screen.queryByText(/not available yet/i)).toBeNull()
  })
})
