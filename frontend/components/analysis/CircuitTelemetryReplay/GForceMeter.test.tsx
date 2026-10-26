// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { GForceMeter } from './GForceMeter'
import type { DriverTelemetry, TelemetryPoint } from '@/types/telemetry'

/**
 * The G-force meter animates transform and opacity only (Block 31, C4: the
 * perf check found its brake arc and labels fading stroke and fill).
 */

afterEach(cleanup)

const point = (distance: number, brake: boolean, lat_g: number): TelemetryPoint => ({
  distance, x: 0, y: 0, speed: 250, throttle: brake ? 0 : 100, brake, gear: 7, drs: 0, lat_g, lon_g: brake ? -4 : 1,
})
const driver: DriverTelemetry = {
  driver_code: 'VER', team_colour: '#3671C6', lap_time: 90, fastest_lap_number: 12, lap_mode: 'fastest_clean',
  points: [point(0, false, 0.5), point(1000, true, 3.2), point(2000, false, -2.1)],
  sector_1_time: null, sector_2_time: null, sector_3_time: null,
}

const ALLOWED = new Set(['transform', 'opacity'])

function transitioned(container: HTMLElement): string[] {
  const out: string[] = []
  for (const el of Array.from(container.querySelectorAll<HTMLElement | SVGElement>('*'))) {
    const t = (el as HTMLElement).style?.transition
    if (t) for (const part of t.split(',')) out.push(part.trim().split(/\s+/)[0])
    const cls = el.getAttribute('class') ?? ''
    if (/\btransition-all\b/.test(cls)) out.push('all')
  }
  return out
}

describe('GForceMeter', () => {
  it.each([0.1, 0.5])('transitions nothing but transform and opacity (progress %s)', (progress) => {
    const { container } = render(<GForceMeter driver={driver} progress={progress} />)
    expect(transitioned(container).filter((p) => !ALLOWED.has(p))).toEqual([])
  })

  it('draws the peak-G bar as a scale, not a width', () => {
    const { container } = render(<GForceMeter driver={driver} progress={0.5} />)
    const bar = container.querySelector<HTMLElement>('[data-peak-g-bar]')!
    expect(bar.style.width).toBe('')
    expect(bar.style.transform).toMatch(/^scaleX\((0(\.\d+)?|1(\.0+)?)\)$/)
  })
})
