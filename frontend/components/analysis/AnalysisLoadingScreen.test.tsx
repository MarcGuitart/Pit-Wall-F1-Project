// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { AnalysisLoadingScreen } from './AnalysisLoadingScreen'
import { LOADING_STEPS } from '@/lib/constants'
import { resetLoadClock } from '@/lib/loadPhase'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-16T12:00:00Z'))
  resetLoadClock(9636)
})
afterEach(() => { cleanup(); vi.useRealTimers() })

const at = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

describe('AnalysisLoadingScreen', () => {
  it('shows nothing for the first 300 ms — a cache hit never flashes a loader', () => {
    const { container } = render(<AnalysisLoadingScreen sessionKey={9636} />)
    expect(container.textContent).toBe('')
    at(299)
    expect(container.textContent).toBe('')
    at(1)
    expect(screen.getByText('Building the race report')).toBeTruthy()
  })

  it('reserves the page height while hidden, so nothing jumps when it appears', () => {
    const { container } = render(<AnalysisLoadingScreen sessionKey={9636} />)
    expect(container.firstElementChild?.getAttribute('aria-busy')).toBe('true')
  })

  it('says the server is waking after 8 s', () => {
    render(<AnalysisLoadingScreen sessionKey={9636} />)
    at(7_999)
    expect(screen.queryByText('Waking up the analysis server…')).toBeNull()
    at(1)
    expect(screen.getByText('Waking up the analysis server…')).toBeTruthy()
  })

  it('never reaches the last step or a full bar before the answer, however long it waits', () => {
    render(<AnalysisLoadingScreen sessionKey={9636} />)
    at(44_900)
    const last = screen.getByText(LOADING_STEPS[LOADING_STEPS.length - 1])
    expect(last.getAttribute('aria-current')).toBeNull()
    const current = screen.getByText(LOADING_STEPS[LOADING_STEPS.length - 2])
    expect(current.getAttribute('aria-current')).toBe('step')
    expect(Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'))).toBeLessThan(100)
  })

  it('advances the steps by time only', () => {
    render(<AnalysisLoadingScreen sessionKey={9636} />)
    at(300)
    expect(screen.getByText(LOADING_STEPS[0]).getAttribute('aria-current')).toBe('step')
    at(1_400)
    expect(screen.getByText(LOADING_STEPS[1]).getAttribute('aria-current')).toBe('step')
  })

  it('counts real elapsed seconds', () => {
    render(<AnalysisLoadingScreen sessionKey={9636} />)
    at(3_200)
    expect(screen.getByLabelText('Elapsed 3 seconds').textContent).toBe('00:03')
  })

  it('claims no number it cannot know', () => {
    const { container } = render(<AnalysisLoadingScreen sessionKey={9636} />)
    at(20_000)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/found|\b\d+\s+(laps?|modules?|drivers?|stints?|signals?)\b/i)
  })
})
