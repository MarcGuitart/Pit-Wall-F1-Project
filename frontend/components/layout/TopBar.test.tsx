// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { TopBar } from './TopBar'
import { useAccessStore } from '@/stores/accessStore'

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

beforeEach(resetStore)
afterEach(cleanup)

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
