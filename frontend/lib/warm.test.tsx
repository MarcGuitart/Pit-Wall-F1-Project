// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const nav = vi.hoisted(() => ({ prefetch: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => nav, usePathname: () => '/races' }))
const api = vi.hoisted(() => ({ pingApi: vi.fn(async () => true) }))
vi.mock('@/lib/api', () => api)

import { MAX_PREFETCH, __resetWarmForTests, useWarmRace, warmRace } from './warm'

function Race({ k }: { k: number }) {
  const warm = useWarmRace()
  return <a href={`/race/${k}`} {...warm(`/race/${k}`)}>Race {k}</a>
}

beforeEach(() => { __resetWarmForTests(); nav.prefetch.mockReset(); api.pingApi.mockClear() })
afterEach(cleanup)

describe('warming a race before the click (block 48)', () => {
  it('pointer over, focus and touch each prefetch the route and ask /health', () => {
    for (const [name, fire] of [
      ['pointer', (el: Element) => fireEvent.pointerEnter(el)],
      ['focus', (el: Element) => fireEvent.focus(el)],
      ['touch', (el: Element) => fireEvent.touchStart(el)],
    ] as const) {
      __resetWarmForTests(); nav.prefetch.mockReset(); api.pingApi.mockClear()
      render(<Race k={9636} />)
      fire(screen.getByRole('link', { name: 'Race 9636' }))
      expect(nav.prefetch, name).toHaveBeenCalledWith('/race/9636')
      expect(api.pingApi, name).toHaveBeenCalledTimes(1)
      cleanup()
    }
  })

  it('each route once; /health once per session however many races are warmed', () => {
    render(<><Race k={9636} /><Race k={9539} /></>)
    const a = screen.getByRole('link', { name: 'Race 9636' })
    fireEvent.pointerEnter(a); fireEvent.focus(a); fireEvent.touchStart(a)
    fireEvent.pointerEnter(screen.getByRole('link', { name: 'Race 9539' }))
    expect(nav.prefetch.mock.calls).toEqual([['/race/9636'], ['/race/9539']])
    expect(api.pingApi).toHaveBeenCalledTimes(1)
  })

  it('/health is not asked again in the same browser session (a reload keeps the flag)', () => {
    sessionStorage.setItem('pw_api_warmed', '1')
    warmRace('/race/9636', nav.prefetch)
    expect(api.pingApi).not.toHaveBeenCalled()
    expect(nav.prefetch).toHaveBeenCalledWith('/race/9636')
  })

  it('at most MAX_PREFETCH routes per tab', () => {
    for (let k = 1; k <= MAX_PREFETCH + 5; k++) warmRace(`/race/${k}`, nav.prefetch)
    expect(nav.prefetch).toHaveBeenCalledTimes(MAX_PREFETCH)
  })

  it('only race routes', () => {
    for (const href of ['/races', '/live/11377', '/docs', '/race/abc']) warmRace(href, nav.prefetch)
    expect(nav.prefetch).not.toHaveBeenCalled()
    expect(api.pingApi).not.toHaveBeenCalled()
  })
})
