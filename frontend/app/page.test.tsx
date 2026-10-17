// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'

// Block 29, task 7: "/" as rendered — one global header and footer, none of
// the prototype's placeholders, and a live card that never shows timing.
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: vi.fn() }), useParams: () => ({}) }))
const live = vi.hoisted(() => ({ state: { state: 'live', sessionKey: 11377 } as { state: string; sessionKey: number | null } }))
vi.mock('@/lib/liveStatus', async (orig) => ({
  ...(await orig<typeof import('@/lib/liveStatus')>()),
  fetchLiveServerStatus: vi.fn(async () => ({ reachable: true, sessionKey: 11377 })),
  fetchLivePublicState: vi.fn(async () => live.state),
  fetchNextLiveSession: vi.fn(async () => ({ place: 'Austin', circuitShortName: 'Austin', sessionKey: 11740, sessionName: 'Practice 1', dateStart: '2026-10-23T17:30:00Z', dateEnd: '2026-10-23T18:30:00Z' })),
}))
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  fetchStats: vi.fn(async () => ({ sessions: 28, driver_laps: 27303, seasons: [2023, 2024, 2026], modules: 17, module_names: [], analysis_version: '4', definitions: {} })),
}))

import HomePage from './page'

afterEach(cleanup)

async function renderHome() {
  const r = render(<HomePage />)
  await act(async () => { await new Promise((res) => setTimeout(res, 20)) })
  return r
}

describe('"/"', () => {
  it('has one header and one footer: the AppShell\'s', async () => {
    const { container } = await renderHome()
    expect(container.querySelectorAll('header')).toHaveLength(1)
    expect(container.querySelectorAll('footer')).toHaveLength(1)
  })

  it('carries none of the prototype\'s placeholders', async () => {
    const { container } = await renderHome()
    const html = container.innerHTML
    const text = container.textContent ?? ''
    for (const s of ['SAMPLE', 'DATA ·', 'Sample Grand Prix', 'XXXX-XXXX', 'ILLUSTRATIVE', 'Get notified']) expect(html).not.toContain(s)
    expect(text).not.toMatch(/\bD([1-9]|[1-5]\d|6[0-3])\b/)
  })

  it('shows real figures from /stats', async () => {
    const { container } = await renderHome()
    expect(container.querySelector('[data-island="stats"]')?.getAttribute('data-state')).toBe('ok')
    expect(container.textContent).toContain('27,303')
  })

  it('a live session gives state and a link, never times, positions or drivers', async () => {
    const { container } = await renderHome()
    const card = container.querySelector('[data-island="live"]')!
    expect(card.getAttribute('data-state')).toBe('live')
    expect(card.querySelector('a')?.getAttribute('href')).toBe('/live/11377')
    const t = card.textContent ?? ''
    expect(t).not.toMatch(/\d:\d\d|\bP\d\b|\blap\b|\b[A-Z]{3}\b(?<!PRO)/)
  })

  it('the sample is São Paulo 2024 from the stored analysis, titled by place', async () => {
    const { container } = await renderHome()
    const sample = container.querySelector('#analysis')!
    expect(sample.textContent).toContain('São Paulo 2024')
    expect(sample.textContent).not.toMatch(/Brazil|São Paulo Grand Prix/)
    expect(sample.querySelector('a[href="/race/9636"]')).toBeTruthy()
  })
})
