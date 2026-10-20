// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('session_id=cs_test_abc'),
  usePathname: () => '/billing/success',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('/billing/success', () => {
  it('with payments off says subscriptions are not open and calls nothing', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_PAYMENTS_ENABLED', '')
    const fetchSpy = vi.fn(async (_u: string) => new Response('[]'))
    vi.stubGlobal('fetch', fetchSpy)
    const { default: Page } = await import('./page')
    render(<Page />)
    expect(await screen.findByText('Subscriptions are not open yet.')).toBeTruthy()
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes('/billing/'))).toBe(false)
  })

  it('with payments on confirms the session and says PRO is active', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_PAYMENTS_ENABLED', '1')
    const fetchSpy = vi.fn(async (u: string) => new Response(JSON.stringify(
      String(u).includes('/billing/success')
        ? { token: 'v1.e30.s', expires_at: 9e9, expires_in: 1, free_seasons: [2023, 2024] }
        : String(u).includes('/access/status')
          ? { pro: true, expires_at: 9e9, expires_in: 1, free_seasons: [2023, 2024], redemption_available: true }
          : []), { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)
    const { default: Page } = await import('./page')
    render(<Page />)
    expect(await screen.findByText(/PRO is active on this browser/)).toBeTruthy()
    expect(String(fetchSpy.mock.calls[0][0])).toMatch(/\/billing\/success\?session_id=cs_test_abc$/)
  })
})
