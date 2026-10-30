// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// Block 44b: a PRO wall is never a dead end once the open week ends.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }), usePathname: () => '/race/11396', useParams: () => ({}) }))
afterEach(() => { cleanup(); vi.unstubAllEnvs() })

async function load(payments: '1' | '') {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_PAYMENTS_ENABLED', payments)
  return { ...(await import('./ProOffer')), ...(await import('@/components/analysis/loader/BlockedPage')) }
}

describe('ProOffer', () => {
  it('payments on: Subscribe, and Restore access for someone already paying', async () => {
    const { ProOffer } = await load('1')
    render(<ProOffer />)
    // the button is loaded on demand (components/billing/lazy.tsx): it arrives after the first render
    expect(await screen.findByRole('button', { name: /^Subscribe, / })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Restore access' }).getAttribute('href')).toBe('/billing/restore')
  })

  it('payments off: "Subscriptions open soon", no button', async () => {
    const { ProOffer } = await load('')
    const { container } = render(<ProOffer />)
    expect(screen.getByText(/Subscriptions open soon/)).toBeTruthy()
    expect(container.querySelector('button')).toBeNull()
  })

  for (const payments of ['1', ''] as const) {
    it(`the race page's PRO wall keeps the code field and the offer (payments ${payments ? 'on' : 'off'})`, async () => {
      const { BlockedPage } = await load(payments)
      const { container } = render(<BlockedPage kind="pro" sessionKey={11396} meta={null} />)
      expect(container.querySelector('input')).toBeTruthy()                    // the access code
      expect(container.querySelector(`[data-pro-offer="${payments ? 'subscribe' : 'soon'}"]`)).toBeTruthy()
    })
  }
})
