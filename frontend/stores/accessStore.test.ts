// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetAccessStoreInFlightForTests, useAccessStore } from './accessStore'
import * as api from '@/lib/api'
import { clearToken, storeToken } from '@/lib/access'

/**
 * The shared PRO store: what it shows before, during and after validating a
 * token, and that signOut/setShowBadge do exactly what they claim to and
 * nothing else.
 */

function resetStore() {
  useAccessStore.setState({
    pro: false, expiresAt: null, redemptionAvailable: false, checked: false, showBadge: true,
  })
}

beforeEach(() => {
  localStorage.clear()
  resetStore()
  __resetAccessStoreInFlightForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('no token', () => {
  it('starts and stays pro:false after refresh, with checked:true once confirmed', async () => {
    vi.spyOn(api, 'fetchAccessStatus').mockResolvedValue({
      pro: false, expires_at: null, expires_in: null, free_seasons: [2023, 2024], redemption_available: true,
    })
    await useAccessStore.getState().refresh()
    const s = useAccessStore.getState()
    expect(s.pro).toBe(false)
    expect(s.checked).toBe(true)
    expect(s.redemptionAvailable).toBe(true)
  })
})

describe('a valid token', () => {
  it('shows pro:true from the local guess immediately, before the server confirms', () => {
    storeToken('tok', Math.floor(Date.now() / 1000) + 3600)
    // A promise that never resolves within the test: proves this assertion
    // holds before any network answer, not just because the mock was fast.
    vi.spyOn(api, 'fetchAccessStatus').mockReturnValue(new Promise(() => {}))
    // Deliberately not awaited: applyLocalGuess() runs synchronously inside
    // refresh(), before the fetch even starts.
    void useAccessStore.getState().refresh()
    expect(useAccessStore.getState().pro).toBe(true)
  })

  it('is confirmed by the server and carries the real expiry through', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600
    storeToken('tok', expiresAt)
    vi.spyOn(api, 'fetchAccessStatus').mockResolvedValue({
      pro: true, expires_at: expiresAt, expires_in: 3600, free_seasons: [2023, 2024], redemption_available: true,
    })
    await useAccessStore.getState().refresh()
    const s = useAccessStore.getState()
    expect(s.pro).toBe(true)
    expect(s.expiresAt).toBe(expiresAt)
    expect(s.checked).toBe(true)
  })
})

describe('an expired token', () => {
  it('never shows a false positive — not locally, not after the server call', async () => {
    // Expired one hour ago: getToken()/hasToken() already drop this, so the
    // local guess must be false too, not just the eventual server answer.
    storeToken('tok', Math.floor(Date.now() / 1000) - 3600)
    vi.spyOn(api, 'fetchAccessStatus').mockResolvedValue({
      pro: false, expires_at: null, expires_in: null, free_seasons: [2023, 2024], redemption_available: true,
    })
    await useAccessStore.getState().refresh()
    const s = useAccessStore.getState()
    expect(s.pro).toBe(false)
    expect(s.checked).toBe(true)
  })

  it('the synchronous local guess alone (before any await) is already false, not a stale true', () => {
    storeToken('tok', Math.floor(Date.now() / 1000) - 3600)
    vi.spyOn(api, 'fetchAccessStatus').mockReturnValue(new Promise(() => {}))
    void useAccessStore.getState().refresh()
    // No await at all — this is the instant applyLocalGuess() ran.
    expect(useAccessStore.getState().pro).toBe(false)
  })
})

describe('a token the backend rejects despite looking locally valid', () => {
  it('is dropped from storage and the store, not left as a false positive', async () => {
    // Tampered or revoked: expiresAt says "not expired yet" locally, but the
    // server disagrees (bad signature, or the code was revoked).
    storeToken('tampered', Math.floor(Date.now() / 1000) + 3600)
    vi.spyOn(api, 'fetchAccessStatus').mockResolvedValue({
      pro: false, expires_at: null, expires_in: null, free_seasons: [2023, 2024], redemption_available: true,
    })
    await useAccessStore.getState().refresh()
    expect(useAccessStore.getState().pro).toBe(false)
    expect(localStorage.getItem('pwiq_pro_token')).toBeNull()
  })
})

describe('signOut', () => {
  it('clears the token and flips pro to false', () => {
    storeToken('tok', Math.floor(Date.now() / 1000) + 3600)
    useAccessStore.setState({ pro: true, expiresAt: Math.floor(Date.now() / 1000) + 3600 })
    useAccessStore.getState().signOut()
    expect(useAccessStore.getState().pro).toBe(false)
    expect(localStorage.getItem('pwiq_pro_token')).toBeNull()
  })

  it('resets the badge preference to visible for the next code redeemed', () => {
    localStorage.setItem('pwiq_pro_show_badge', '0')
    useAccessStore.setState({ showBadge: false })
    useAccessStore.getState().signOut()
    expect(useAccessStore.getState().showBadge).toBe(true)
    expect(localStorage.getItem('pwiq_pro_show_badge')).toBe('1')
  })
})

describe('setShowBadge — the toggle in Settings, with a valid token', () => {
  it('changes showBadge without touching the token at all', () => {
    storeToken('tok', Math.floor(Date.now() / 1000) + 3600)
    useAccessStore.setState({ pro: true, showBadge: true })

    useAccessStore.getState().setShowBadge(false)

    expect(useAccessStore.getState().showBadge).toBe(false)
    expect(useAccessStore.getState().pro).toBe(true) // unchanged
    expect(localStorage.getItem('pwiq_pro_token')).toBe('tok') // unchanged
  })

  it('persists across a refresh, unlike a signOut which would clear everything', async () => {
    storeToken('tok', Math.floor(Date.now() / 1000) + 3600)
    useAccessStore.getState().setShowBadge(false)
    vi.spyOn(api, 'fetchAccessStatus').mockResolvedValue({
      pro: true, expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600,
      free_seasons: [2023, 2024], redemption_available: true,
    })
    await useAccessStore.getState().refresh()
    expect(useAccessStore.getState().showBadge).toBe(false)
    expect(useAccessStore.getState().pro).toBe(true)
  })
})

describe('refresh — concurrent calls', () => {
  it('share one in-flight request rather than firing one fetch per caller', async () => {
    const spy = vi.spyOn(api, 'fetchAccessStatus').mockResolvedValue({
      pro: false, expires_at: null, expires_in: null, free_seasons: [2023, 2024], redemption_available: true,
    })
    await Promise.all([
      useAccessStore.getState().refresh(),
      useAccessStore.getState().refresh(),
      useAccessStore.getState().refresh(),
    ])
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
