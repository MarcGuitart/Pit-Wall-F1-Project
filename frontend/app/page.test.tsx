// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'

// Block 29, task 7: "/" as rendered — one global header and footer, none of
// the prototype's placeholders, and a live card that never shows timing.
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: vi.fn() }), useParams: () => ({}) }))
const live = vi.hoisted(() => ({ state: { state: 'live', sessionKey: 11377 } as { state: string; sessionKey: number | null } }))
vi.mock('@/lib/liveStatus', async (orig) => ({
  ...(await orig<typeof import('@/lib/liveStatus')>()),
  fetchLiveServerStatus: vi.fn(async () => ({ reachable: true, sessionKey: 11377 })),
  fetchLivePublicState: vi.fn(async () => live.state),
  // A session on track now (started 10 min ago): the live card only asks /live/state inside that window (block 51).
  fetchNextLiveSession: vi.fn(async () => ({ place: 'Austin', circuitShortName: 'Austin', sessionKey: 11740, sessionName: 'Practice 1', dateStart: new Date(Date.now() - 10 * 60_000).toISOString(), dateEnd: new Date(Date.now() + 50 * 60_000).toISOString() })),
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
    // The figures count up once the data is in (block 37): wait for the end.
    await waitFor(() => expect(container.textContent).toContain('27,303'), { timeout: 3000 })
  })

  it('a live session gives state and a link, never times, positions or drivers', async () => {
    const { container } = await renderHome()
    const card = container.querySelector('[data-island="live"]')!
    expect(card.getAttribute('data-state')).toBe('live')
    expect(card.querySelector('a')?.getAttribute('href')).toBe('/live/11377')
    const t = card.textContent ?? ''
    expect(t).not.toMatch(/\d:\d\d|\bP\d\b|\blap\b|\b[A-Z]{3}\b(?<!PRO)/)
  })

  it('has no sample analysis and no recorded capture (Block 32)', async () => {
    const { container } = await renderHome()
    expect(container.querySelector('#analysis')).toBeNull()
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/Sample analysis|Recorded session/)
    expect(container.querySelector('img[src*="live-baku"]')).toBeNull()
  })

  it('the anchor bar points at the sections in order, and they are numbered 01…N', async () => {
    const { container } = await renderHome()
    const anchors = Array.from(container.querySelectorAll('nav[aria-label="On this page"] a')).map((a) => a.getAttribute('href')!.slice(1))
    const sections = Array.from(container.querySelectorAll('section[id]')).map((s) => s.id).filter((id) => anchors.includes(id))
    expect(sections).toEqual(anchors)
    const nums = Array.from(container.querySelectorAll('section[id]'))
      .map((s) => s.querySelector('span')?.textContent ?? '')
      .filter((t) => /^\d\d · /.test(t)).map((t) => t.slice(0, 2))
    expect(nums).toEqual(anchors.map((_, i) => String(i + 1).padStart(2, '0')))
  })

  it('features the Recon Lap as a plain link, with no canvas and no 3D (block 52b)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-11-04T12:00:00Z'))
      const { container, unmount } = await renderHome()
      const card = container.querySelector('section[aria-labelledby="recon-card-title"]')
      expect(card?.querySelector('a')?.getAttribute('href')).toBe('/recon/interlagos')
      expect(card?.textContent).toContain('Lando Norris')
      expect(container.querySelector('canvas')).toBeNull()
      unmount()
      vi.setSystemTime(new Date('2026-11-10T12:00:00Z'))
      const after = await renderHome()
      expect(after.container.querySelector('section[aria-labelledby="recon-card-title"]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
