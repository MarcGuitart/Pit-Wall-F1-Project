// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { FullRaceAnalysis } from '@/types'

// Block 31, C4: opening the race engineer measured INP 200–216 ms with the CPU
// throttled four times, because the click re-rendered the whole analysis page
// (it read the entire race store). Opening and closing the overlay must leave
// the page's own content alone.
const renders = vi.hoisted(() => ({ tabNav: 0 }))
vi.mock('./TabNav', () => ({ TabNav: () => { renders.tabNav++; return <nav>tabs</nav> } }))
vi.mock('@/components/radio/RadioOverlay', () => ({ RadioOverlay: () => <div role="dialog">engineer</div> }))
vi.mock('@/lib/api', () => ({ fetchSessionMeta: vi.fn(() => new Promise(() => {})), fetchLapCharts: vi.fn(() => new Promise(() => {})) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/race/9539' }))

import { AnalysisPage } from './AnalysisPage'
import { useRaceStore } from '@/stores/raceStore'

afterEach(() => { cleanup(); act(() => useRaceStore.getState().setRadioOpen(false)) })

describe('opening the race engineer', () => {
  it('shows the overlay without re-rendering the analysis page', () => {
    const analysis = JSON.parse(readFileSync(join(__dirname, '../../../backend/cache/9539/_analysis.json'), 'utf8')) as FullRaceAnalysis
    render(<AnalysisPage analysis={analysis} />)
    const before = renders.tabNav
    act(() => useRaceStore.getState().setRadioOpen(true))
    expect(screen.getByRole('dialog').textContent).toBe('engineer')
    act(() => useRaceStore.getState().setRadioOpen(false))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(renders.tabNav).toBe(before)
  })
})
