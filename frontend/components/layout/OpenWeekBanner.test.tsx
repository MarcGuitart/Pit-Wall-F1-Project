// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

// The promo banner: the code comes from GET /access/promo (mocked); this code is a test value, never the real one.
const api = vi.hoisted(() => ({ fetchPromo: vi.fn(), redeemAccessCode: vi.fn() }))
vi.mock('@/lib/api', () => api)
const access = vi.hoisted(() => ({ pro: false }))
vi.mock('@/stores/accessStore', () => ({
  useAccessStore: (pick: (s: { pro: boolean }) => unknown) => pick({ pro: access.pro }),
}))

import { DISMISS_KEY, OpenWeekBanner } from './OpenWeekBanner'
import { __resetPromoForTests, loadPromo, remainingText } from '@/lib/promo'
import { ApiError } from '@/lib/errors'

const CODE = 'TESTPROMO9'
const UNTIL = '2026-11-10T23:59:00+01:00'      // 22:59 UTC

function setLanguage(lang: string) {
  Object.defineProperty(window.navigator, 'language', { value: lang, configurable: true })
}

async function promo(active = true) {
  api.fetchPromo.mockResolvedValue(active
    ? { active: true, code: CODE, until: UNTIL, days: 7, answered: true }
    : { active: false, code: null, until: null, days: null, answered: true })
  await act(async () => { await loadPromo() })
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-11-03T22:59:00Z'))       // 7 days before the end
  __resetPromoForTests()
  access.pro = false
  setLanguage('en-GB')
  window.sessionStorage.clear()
  api.redeemAccessCode.mockReset()
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('remainingText', () => {
  const end = Date.parse(UNTIL)
  it('whole days while more than a day is left, rounded up', () => {
    expect(remainingText(UNTIL, end - 7 * 86_400_000, 'en')).toBe('7 days remaining')
    expect(remainingText(UNTIL, end - 25 * 3_600_000, 'en')).toBe('2 days remaining')
    expect(remainingText(UNTIL, end - 3 * 86_400_000, 'es')).toBe('Quedan 3 días')
  })
  it('hours on the last day, never 0 while running', () => {
    expect(remainingText(UNTIL, end - 24 * 3_600_000, 'en')).toBe('24h remaining')
    expect(remainingText(UNTIL, end - 4.5 * 3_600_000, 'en')).toBe('5h remaining')
    expect(remainingText(UNTIL, end - 60_000, 'en')).toBe('1h remaining')
    expect(remainingText(UNTIL, end - 4.5 * 3_600_000, 'es')).toBe('Quedan 5 h')
  })
})

describe('banner', () => {
  it('in English: the offer, the code and the countdown', async () => {
    await promo()
    render(<OpenWeekBanner />)
    expect(screen.getByText(`7 days of PRO free with code ${CODE}`)).toBeTruthy()
    expect(screen.getByText('7 days remaining')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Redeem' })).toBeTruthy()
  })

  it('in Spanish for a browser that asks for it', async () => {
    setLanguage('es-ES')
    await promo()
    render(<OpenWeekBanner />)
    expect(screen.getByText(`7 días de PRO gratis con el código ${CODE}`)).toBeTruthy()
    expect(screen.getByText('Quedan 7 días')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Canjear' })).toBeTruthy()
  })

  it('the countdown moves by the minute, into hours on the last day', async () => {
    vi.setSystemTime(new Date('2026-11-09T22:58:30Z'))      // a day and 30 s left
    await promo()
    render(<OpenWeekBanner />)
    expect(screen.getByText('2 days remaining')).toBeTruthy()
    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(screen.getByText('24h remaining')).toBeTruthy()
  })

  it('goes by itself at the end', async () => {
    vi.setSystemTime(new Date('2026-11-10T22:58:00Z'))
    await promo()
    render(<OpenWeekBanner />)
    expect(screen.getByText('1h remaining')).toBeTruthy()
    await act(async () => { vi.advanceTimersByTime(2 * 60_000) })
    expect(document.querySelector('[data-promo-banner]')).toBeNull()
  })

  it('nothing without a running promo, or for a browser that already has PRO', async () => {
    await promo(false)
    const { unmount } = render(<OpenWeekBanner />)
    expect(document.querySelector('[data-promo-banner]')).toBeNull()
    unmount()
    await promo(true)
    access.pro = true
    render(<OpenWeekBanner />)
    expect(document.querySelector('[data-promo-banner]')).toBeNull()
  })

  it('redeems from the banner and says so', async () => {
    api.redeemAccessCode.mockResolvedValue({ pro: true })
    await promo()
    render(<OpenWeekBanner />)
    fireEvent.change(screen.getByLabelText('Promo code'), { target: { value: 'testpromo9' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Redeem' })) })
    expect(api.redeemAccessCode).toHaveBeenCalledWith('testpromo9')
    expect(screen.getByRole('status').textContent).toBe('Done: PRO is on. Every season and live mode are open.')
    expect(screen.queryByRole('button', { name: 'Redeem' })).toBeNull()
  })

  it.each([
    ['INVALID_ACCESS_CODE', 'That code is not valid.'],
    ['PROMO_EXPIRED', 'That code has ended.'],
    ['RATE_LIMITED', 'Too many attempts. Wait a few minutes and try again.'],
    ['SOMETHING_ELSE', 'Could not check that code. Try again.'],
  ])('a refused code (%s) says why', async (code, message) => {
    api.redeemAccessCode.mockRejectedValue(new ApiError(400, code, 'x'))
    await promo()
    render(<OpenWeekBanner />)
    fireEvent.change(screen.getByLabelText('Promo code'), { target: { value: 'nope' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Redeem' })) })
    expect(screen.getByRole('status').textContent).toBe(message)
    expect(screen.getByLabelText('Promo code').getAttribute('aria-invalid')).toBe('true')
  })

  it('closed for the session, per code', async () => {
    await promo()
    const { unmount } = render(<OpenWeekBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(document.querySelector('[data-promo-banner]')).toBeNull()
    expect(window.sessionStorage.getItem(DISMISS_KEY)).toBe(CODE)
    unmount()
    render(<OpenWeekBanner />)
    expect(document.querySelector('[data-promo-banner]')).toBeNull()
  })

  it('still closes when sessionStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    await promo()
    render(<OpenWeekBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(document.querySelector('[data-promo-banner]')).toBeNull()
  })

  it('takes no room in the page: the banner is its own fixed layer, outside the flow', async () => {
    const css = readFileSync(join(process.cwd(), 'components/layout/openWeekBanner.module.css'), 'utf8')
    expect(css).toMatch(/\.banner\s*\{[^}]*position:\s*fixed/)
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[^}]*\{\s*\.banner\s*\{\s*animation:\s*none/)
  })
})
