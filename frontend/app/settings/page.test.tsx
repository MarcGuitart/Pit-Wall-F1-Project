// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import SettingsPage from './page'
import { useAccessStore } from '@/stores/accessStore'
import { storeToken } from '@/lib/access'

/**
 * Settings: the toggle with a valid token must be a display preference only —
 * it must never clear the token. "Sign out" is the one thing that does.
 */

function resetStore() {
  useAccessStore.setState({
    pro: false, expiresAt: null, redemptionAvailable: false, checked: true, showBadge: true,
  })
}

beforeEach(() => {
  localStorage.clear()
  resetStore()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('with a valid token', () => {
  beforeEach(() => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600
    storeToken('a-real-token', expiresAt)
    useAccessStore.setState({ pro: true, expiresAt, checked: true, showBadge: true })
  })

  it('shows the toggle on and "valid until"', () => {
    render(<SettingsPage />)
    const toggle = screen.getByRole('switch')
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText(/Valid until/i)).toBeTruthy()
  })

  it('turning the toggle off does NOT remove the token from storage', () => {
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('switch'))

    expect(localStorage.getItem('pwiq_pro_token')).toBe('a-real-token')
    expect(useAccessStore.getState().pro).toBe(true) // access itself is unchanged
    expect(useAccessStore.getState().showBadge).toBe(false) // only the display preference moved
  })

  it('the toggle only affects showBadge — flipping it back on restores it, token untouched throughout', () => {
    render(<SettingsPage />)
    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle) // off
    fireEvent.click(toggle) // on again
    expect(localStorage.getItem('pwiq_pro_token')).toBe('a-real-token')
    expect(useAccessStore.getState().showBadge).toBe(true)
  })

  it('explains in the UI, before it is even toggled off, that OFF is a display preference', () => {
    render(<SettingsPage />)
    // showBadge starts true: this is the warning shown ahead of the click.
    expect(screen.getByText(/does not sign you out/i)).toBeTruthy()
  })

  it('after toggling off, says access is still active — not signed out', () => {
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('switch'))
    expect(screen.getByText(/still active/i)).toBeTruthy()
  })

  it('"Sign out of PRO" — and only that — actually removes the token', () => {
    render(<SettingsPage />)
    fireEvent.click(screen.getByText(/Sign out of PRO/i))

    expect(localStorage.getItem('pwiq_pro_token')).toBeNull()
    expect(useAccessStore.getState().pro).toBe(false)
  })
})

describe('without a token', () => {
  it('shows the toggle off and no "valid until"', () => {
    render(<SettingsPage />)
    const toggle = screen.getByRole('switch')
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(screen.queryByText(/Valid until/i)).toBeNull()
  })

  it('turning the toggle on reveals the access-code field, not a token', () => {
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('switch'))
    expect(screen.getByLabelText(/Access code/i)).toBeTruthy()
    expect(localStorage.getItem('pwiq_pro_token')).toBeNull()
  })

  it('a wrong code shows an error and still no token', async () => {
    const api = await import('@/lib/api')
    const { ApiError } = await import('@/lib/errors')
    vi.spyOn(api, 'redeemAccessCode').mockRejectedValue(
      new ApiError(401, 'INVALID_ACCESS_CODE', 'That access code is not valid.'),
    )
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.change(screen.getByLabelText(/Access code/i), { target: { value: 'wrong-code' } })
    fireEvent.click(screen.getByText(/Unlock/i))
    expect(await screen.findByText(/not valid/i)).toBeTruthy()
    expect(localStorage.getItem('pwiq_pro_token')).toBeNull()
  })
})
