import { create } from 'zustand'
import { fetchAccessStatus, type AccessStatus } from '@/lib/api'
import {
  ACCESS_CHANGED_EVENT,
  announceAccessChange,
  clearToken,
  getShowProBadgePreference,
  hasToken,
  setShowProBadgePreference,
  tokenExpiry,
} from '@/lib/access'

/**
 * Where "is PRO active" lives, for the whole app.
 *
 * Two layers of validation, on purpose — "validar el token, no solo su
 * presencia" from the brief:
 *
 *   1. Synchronous, local: hasToken()/tokenExpiry() already drop a token past
 *      its stored expiry (lib/access.ts). This is what the store shows the
 *      instant it is read, so there is no flash of "PRO" before anything has
 *      actually been checked.
 *   2. Asynchronous, authoritative: /access/status, which the backend
 *      verifies (signature, revocation) the same way it verifies every PRO
 *      request. This is what corrects the local guess — a tampered or
 *      revoked token looks locally fine but is rejected here, and the store
 *      (and localStorage) drop it rather than wait for some later request to
 *      happen to 402.
 *
 * `checked` distinguishes "still trusting the local guess" from "confirmed by
 * the backend at least once" — a page that cares (Settings) can use it to
 * avoid saying "valid until ..." before that date has actually been verified.
 *
 * `showBadge` is a different kind of thing entirely: not access, a display
 * preference for this browser (Block 20, Settings' toggle when a token is
 * already valid). It starts `true` — matching what a fresh page load with no
 * localStorage read yet would show on the server — and is corrected to the
 * real stored value inside refresh(), the same client-only pass that corrects
 * `pro`/`expiresAt`, so nothing here can cause a hydration mismatch by reading
 * localStorage before the client has actually mounted.
 */
type AccessState = {
  pro: boolean
  expiresAt: number | null // epoch seconds
  redemptionAvailable: boolean
  checked: boolean
  showBadge: boolean
  /** Re-derive from localStorage, then confirm with the backend. Safe to call
   *  repeatedly — concurrent calls share one in-flight request. */
  refresh: () => Promise<void>
  /** Local-only: does not touch the token. See the store's own doc comment on
   *  why this must never look the same as signing out. */
  signOut: () => void
  /** Settings' toggle when a valid token exists: show/hide the TopBar badge.
   *  Never touches the token — see the module doc comment. */
  setShowBadge: (show: boolean) => void
}

let inFlight: Promise<void> | null = null

export const useAccessStore = create<AccessState>((set) => {
  function applyLocalGuess() {
    const expiry = tokenExpiry()
    set({
      pro: hasToken(),
      expiresAt: expiry ? Math.floor(expiry.getTime() / 1000) : null,
      showBadge: getShowProBadgePreference(),
    })
  }

  async function doRefresh() {
    applyLocalGuess()
    let status: AccessStatus
    try {
      status = await fetchAccessStatus()
    } catch {
      // fetchAccessStatus() itself does not throw (it degrades to pro:false),
      // but guard anyway: a network failure must not leave `checked` true
      // over a guess that was never actually confirmed.
      return
    }
    if (!status.pro && hasToken()) {
      // The backend disagrees with what looked like a valid token locally —
      // tampered, or the code was revoked. Drop it so storage and the UI
      // agree, the same way apiFetch already does on a live PRO_REQUIRED.
      clearToken()
    }
    set({
      pro: status.pro,
      expiresAt: status.expires_at,
      redemptionAvailable: status.redemption_available,
      checked: true,
    })
  }

  return {
    pro: false,
    expiresAt: null,
    redemptionAvailable: false,
    checked: false,
    showBadge: true,

    refresh: () => {
      if (!inFlight) {
        inFlight = doRefresh().finally(() => {
          inFlight = null
        })
      }
      return inFlight
    },

    signOut: () => {
      clearToken()
      // A clean slate: the next code redeemed on this browser starts visible,
      // rather than inheriting a previous session's "hidden" preference.
      setShowProBadgePreference(true)
      set({ pro: false, expiresAt: null, checked: true, showBadge: true })
      announceAccessChange()
    },

    setShowBadge: (show) => {
      setShowProBadgePreference(show)
      set({ showBadge: show })
    },
  }
})

/** Re-exported so a listener only needs this module, not lib/access.ts too. */
export { ACCESS_CHANGED_EVENT }

/**
 * Test-only: clears the module-level in-flight guard. Without this, a test
 * that calls refresh() without awaiting it (to inspect the synchronous local
 * guess before the network resolves) leaves `inFlight` set, and the next
 * test's refresh() silently returns that stale promise instead of starting
 * its own — a real test-isolation bug this store's memoization would
 * otherwise cause. Not used by the app itself.
 */
export function __resetAccessStoreInFlightForTests(): void {
  inFlight = null
}
