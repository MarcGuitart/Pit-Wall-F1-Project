// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

// PAYMENTS_ENABLED is read when lib/payments loads, so each case sets the env
// and imports afresh.
async function load(enabled: boolean) {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_PAYMENTS_ENABLED', enabled ? '1' : '')
  return {
    payments: await import('@/lib/payments'),
    button: await import('./SubscribeButton'),
    manage: await import('./ManageSubscription'),
  }
}

function token(cid: string) {
  const payload = btoa(JSON.stringify({ cid, iat: 1, exp: 2 })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `v1.${payload}.sig`
}

function store(tok: string, expiresInS: number) {
  localStorage.setItem('pwiq_pro_token', tok)
  localStorage.setItem('pwiq_pro_expires_at', String(Math.floor(Date.now() / 1000) + expiresInS))
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('payments off (the default)', () => {
  it('shows no Subscribe and no Manage subscription, and never renews', async () => {
    const { payments, button, manage } = await load(false)
    expect(payments.PAYMENTS_ENABLED).toBe(false)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    store(token('stripe:abc'), 60)
    const { container } = render(<><button.SubscribeButton /><manage.ManageSubscription /></>)
    expect(container.textContent).toBe('')
    expect(await payments.renewIfDue()).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('payments on', () => {
  it('tells subscription tokens from code tokens', async () => {
    const { payments } = await load(true)
    expect(payments.isSubscriptionToken(token('stripe:abc'))).toBe(true)
    expect(payments.isSubscriptionToken(token('0123456789ab'))).toBe(false)
    expect(payments.isSubscriptionToken('garbage')).toBe(false)
    expect(payments.isSubscriptionToken(null)).toBe(false)
  })

  it('Subscribe opens Stripe Checkout, in plain text with no dashes', async () => {
    const { button } = await load(true)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ url: 'https://checkout.stripe.com/x' }), { status: 200 })))
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    render(<button.SubscribeButton />)
    const b = screen.getByRole('button', { name: 'Subscribe, €2.99 a month' })
    expect(document.body.textContent).not.toMatch(/[–—]| - /)
    fireEvent.click(b)
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/x'))
  })

  it('renews a subscription token close to its end, not one far from it, nor a code token', async () => {
    const { payments } = await load(true)
    const fetchSpy = vi.fn(async (_u: string) => new Response(JSON.stringify({ token: token('stripe:abc'), expires_at: 9e9, expires_in: 1, free_seasons: [2023, 2024] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)
    store(token('stripe:abc'), 30 * 86400)
    expect(await payments.renewIfDue()).toBe(false)
    store(token('0123456789ab'), 60)
    expect(await payments.renewIfDue()).toBe(false)
    store(token('stripe:abc'), 2 * 86400)
    expect(await payments.renewIfDue()).toBe(true)
    expect(String(fetchSpy.mock.calls[0][0])).toMatch(/\/billing\/renew$/)
  })

  it('Manage subscription shows only for a subscription token', async () => {
    const { manage } = await load(true)
    store(token('0123456789ab'), 60)
    const a = render(<manage.ManageSubscription />)
    expect(a.container.textContent).toBe('')
    a.unmount()
    store(token('stripe:abc'), 60)
    render(<manage.ManageSubscription />)
    expect(await screen.findByRole('button', { name: 'Manage subscription' })).toBeTruthy()
  })
})
