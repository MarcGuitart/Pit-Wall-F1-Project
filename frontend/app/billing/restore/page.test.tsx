// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

// Restore access (block 44b): the form, the emailed link, and payments off.
const params = vi.hoisted(() => ({ value: '' }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(params.value),
  usePathname: () => '/billing/restore',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); params.value = '' })

const SAME = 'If an active subscription uses that email, a link to restore access is on its way. It works for 15 minutes.'

async function page(payments: '1' | '', fetchImpl: (u: string, init?: RequestInit) => Promise<Response>) {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_PAYMENTS_ENABLED', payments)
  const spy = vi.fn(fetchImpl)
  vi.stubGlobal('fetch', spy)
  const { default: Page } = await import('./page')
  render(<Page />)
  return spy
}

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status })

describe('/billing/restore', () => {
  it('sends the email and shows the API answer, the same whatever the email', async () => {
    const spy = await page('1', async () => json({ sent: true, message: SAME }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'someone@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send the link' }))
    expect(await screen.findByText(SAME)).toBeTruthy()
    const [url, init] = spy.mock.calls.find(([u]) => String(u).includes('/billing/restore'))!
    expect(String(url)).toMatch(/\/billing\/restore$/)
    expect(JSON.parse(String(init?.body))).toEqual({ email: 'someone@example.com' })
  })

  it('the emailed link restores PRO on this browser', async () => {
    params.value = 'token=rs1.abc.def'
    const spy = await page('1', async (u) => String(u).includes('/billing/restore/redeem')
      ? json({ token: 'v1.e30.s', expires_at: 9e9, expires_in: 1, free_seasons: [2023, 2024] })
      : json({ pro: true, expires_at: 9e9, expires_in: 1, free_seasons: [2023, 2024], redemption_available: true }))
    expect(await screen.findByText('PRO is active again on this browser.')).toBeTruthy()
    expect(spy.mock.calls.some(([u]) => String(u).includes('/billing/restore/redeem'))).toBe(true)
  })

  it('an expired or broken link says so and offers a new one', async () => {
    params.value = 'token=rs1.old.link'
    await page('1', async () => json({ error: { code: 'RESTORE_LINK_EXPIRED', message: 'expired' } }, 410))
    expect(await screen.findByText(/This link is not valid any more/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ask for a new link' }).getAttribute('href')).toBe('/billing/restore')
  })

  it('with payments off it says subscriptions open soon and asks nothing', async () => {
    const spy = await page('', async () => json([]))
    expect(await screen.findByText(/Subscriptions open soon/)).toBeTruthy()
    expect(spy.mock.calls.some(([u]) => String(u).includes('/billing/'))).toBe(false)
  })
})
