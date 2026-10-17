// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { FullRaceAnalysis } from '@/types'

vi.mock('@/lib/api', () => ({ fetchLapCharts: vi.fn(() => new Promise(() => {})) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/race/9539' }))

import { AnalysisPage } from './AnalysisPage'

// Block 27b: a race with no team radio keeps the lane's height (the loader
// reserves it) and says why, instead of collapsing the band on arrival.
const cached = JSON.parse(readFileSync(join(__dirname, '../../../backend/cache/9539/_analysis.json'), 'utf8')) as FullRaceAnalysis
afterEach(cleanup)

describe('team radio lane', () => {
  it('a race with clips draws the lane', () => {
    const { container } = render(<AnalysisPage analysis={cached} />)
    expect(container.querySelector('[data-radio-empty]')).toBeNull()
  })

  it('a race with none keeps the slot, with the module\'s reason', () => {
    const analysis = {
      ...cached,
      team_radio: null,
      modules: { ...cached.modules, team_radio: { status: 'not_applicable', reason: 'No team radio published for this session.' } },
    } as unknown as FullRaceAnalysis
    const { container } = render(<AnalysisPage analysis={analysis} />)
    expect(container.querySelector('[data-radio-empty]')).toBeTruthy()
    expect(screen.getByText('No team radio published for this session.')).toBeTruthy()
  })
})
