// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { SessionMeta } from '@/types'

vi.mock('@/lib/api', () => ({ fetchSessionMeta: vi.fn(() => new Promise(() => {})) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }))

import { AnalysisLoadingScreen } from './AnalysisLoadingScreen'
import { resetLoadClock } from '@/lib/loadPhase'
import { __resetSessionMetaForTests } from '@/lib/sessionMeta'

const META: SessionMeta = {
  session_key: 9539, meeting_key: 1238, meeting_name: 'Spanish Grand Prix', location: 'Barcelona',
  circuit_short_name: 'Catalunya', country_name: 'Spain', year: 2024, session_name: 'Race', session_type: 'Race',
  date_start: '2024-06-23T13:00:00+00:00', date_end: '2024-06-23T15:00:00+00:00', is_cancelled: false,
  analysis_cached: true, earliest_at: '2024-06-23T15:30:00+00:00',
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-16T12:00:00Z'))
  resetLoadClock(9539)
  __resetSessionMetaForTests()
})
afterEach(() => { cleanup(); vi.useRealTimers() })

const at = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
const state = (c: HTMLElement) => c.querySelector('[data-state]')?.getAttribute('data-state')
const ruleScale = (c: HTMLElement) => Number(/scaleX\(([\d.]+)\)/.exec((c.querySelector('[class*="ruleAccent"]') as HTMLElement).style.transform)![1])

describe('AnalysisLoadingScreen — states by elapsed time', () => {
  it('state 1: nothing for the first 300 ms, only the reserved space', () => {
    const { container } = render(<AnalysisLoadingScreen sessionKey={9539} meta={META} />)
    expect(container.textContent).toBe('')
    expect(container.firstElementChild?.getAttribute('aria-busy')).toBe('true')
    at(299)
    expect(container.textContent).toBe('')
    at(1)
    expect(state(container)).toBe('loading')
    expect(screen.getByText('Loading analysis')).toBeTruthy()
  })

  it('state 2: the real header facts, the clock and the method panel', () => {
    render(<AnalysisLoadingScreen sessionKey={9539} meta={META} />)
    at(3_200)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Barcelona')
    expect(screen.getByText('2024 · Race · 23 Jun 2024')).toBeTruthy()
    expect(screen.getByLabelText('Elapsed 3 seconds').textContent).toBe('00:03')
    expect(screen.getByText('How this is measured')).toBeTruthy()
    expect(screen.getByText('Pit, safety-car, red/yellow-flag and outlier laps are excluded from pace.')).toBeTruthy()
    expect(screen.getByText('Pace, tyre and pit estimates carry a confidence label.')).toBeTruthy()
    expect(screen.getByText('n is the number of clean laps behind a pace figure.')).toBeTruthy()
  })

  it('state 3: waking at 8 s, with no ETA', () => {
    const { container } = render(<AnalysisLoadingScreen sessionKey={9539} meta={META} />)
    at(7_999)
    expect(state(container)).toBe('loading')
    at(1)
    expect(state(container)).toBe('waking')
    expect(screen.getByText('Waking up the analysis server')).toBeTruthy()
    expect(container.textContent).not.toMatch(/\bETA\b|remaining|\d+\s*%/i)
  })

  it('state 4: at 45 s the fact, Retry and Back to race list; the clock goes', () => {
    const retry = vi.fn()
    const { container } = render(<AnalysisLoadingScreen sessionKey={9539} meta={META} onRetry={retry} />)
    at(45_000)
    expect(state(container)).toBe('error')
    expect(screen.getByText('The server did not answer within 45 seconds.')).toBeTruthy()
    expect(screen.queryByText(/Elapsed/)).toBeNull()
    screen.getByRole('button', { name: 'Retry' }).click()
    expect(retry).toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Back to race list' }).getAttribute('href')).toBe('/')
  })

  it('failed (the page aborted) shows state 4 at once', () => {
    const { container } = render(<AnalysisLoadingScreen sessionKey={9539} meta={META} failed />)
    expect(state(container)).toBe('error')
  })

  it('the time rule creeps every second and never completes', () => {
    const { container } = render(<AnalysisLoadingScreen sessionKey={9539} meta={META} />)
    at(300)
    const first = ruleScale(container)
    at(1_000)
    expect(ruleScale(container)).toBeGreaterThan(first)
    at(43_000)
    expect(ruleScale(container)).toBeLessThan(0.94)
  })

  it('without facts yet, the header keeps bars instead of inventing a name', () => {
    render(<AnalysisLoadingScreen sessionKey={9539} />)
    at(300)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('')
  })

  it('claims no number it cannot know', () => {
    const { container } = render(<AnalysisLoadingScreen sessionKey={9539} meta={META} />)
    at(20_000)
    expect(container.textContent ?? '').not.toMatch(/found|\b\d+\s+(laps?|modules?|drivers?|stints?|signals?)\b/i)
  })
})
