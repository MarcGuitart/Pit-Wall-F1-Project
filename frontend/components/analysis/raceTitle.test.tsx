// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { FullRaceAnalysis, SessionMeta } from '@/types'
import kualaLumpur from '@/test/fixtures/meta_kuala_lumpur_2026.json'

// Block 27b: a race's headline is its place (location), never OpenF1's
// meeting_name or country_name. The fixture is /sessions/11731/meta as the
// backend answers it: OpenF1 calls the 2026 Kuala Lumpur race "Bahrain Grand
// Prix", in "Bahrain".
vi.mock('@/lib/api', () => ({ fetchSessionMeta: vi.fn(() => new Promise(() => {})), fetchLapCharts: vi.fn(() => new Promise(() => {})) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/race/11731' }))
vi.mock('@/lib/liveStatus', () => ({ fetchLiveServerStatus: vi.fn(async () => ({ reachable: false, sessionKey: null })) }))

import { AnalysisLoadingScreen } from './AnalysisLoadingScreen'
import { BlockedPage } from './loader/BlockedPage'
import { AnalysisPage } from './AnalysisPage'
import { raceBreadcrumb } from '@/lib/sessionFacts'

const META = kualaLumpur as SessionMeta
afterEach(cleanup)

const noOpenF1Names = () => {
  expect(document.body.textContent).not.toMatch(/Bahrain/)
}

describe('Kuala Lumpur 2026 is titled Kuala Lumpur', () => {
  it('the fixture really carries the wrong OpenF1 names', () => {
    expect(META.meeting_name).toBe('Bahrain Grand Prix')
    expect(META.country_name).toBe('Bahrain')
  })

  it('in the loader', () => {
    render(<AnalysisLoadingScreen sessionKey={11731} meta={META} failed />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Kuala Lumpur')
    noOpenF1Names()
  })

  it('in the breadcrumb', () => {
    expect(raceBreadcrumb(META)?.map((c) => c.label)).toEqual(['2026', 'Kuala Lumpur', 'Race'])
  })

  it('on a blocked page', () => {
    render(<BlockedPage kind="unpublished" sessionKey={11731} meta={META} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Kuala Lumpur')
    noOpenF1Names()
  })

  it('in the analysis header, even when the analysis itself carries the OpenF1 names', () => {
    const cached = JSON.parse(readFileSync(join(__dirname, '../../../backend/cache/9539/_analysis.json'), 'utf8'))
    const analysis = { ...cached, race: { ...cached.race, session_key: 11731, meeting_name: 'Bahrain Grand Prix', country_name: 'Bahrain', circuit_short_name: 'Kuala Lumpur', year: 2026 } } as FullRaceAnalysis
    render(<AnalysisPage analysis={analysis} meta={META} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Kuala Lumpur')
    noOpenF1Names()
  })
})
