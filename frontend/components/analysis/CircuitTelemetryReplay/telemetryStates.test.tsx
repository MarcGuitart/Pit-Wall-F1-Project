// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { FullRaceAnalysis } from '@/types'

/**
 * Block 32, task 7: telemetry that does not exist is a permanent state with a
 * reason and no Retry; Retry is only offered after a network failure or a 5xx.
 */
const api = vi.hoisted(() => ({ getTelemetry: vi.fn() }))
vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), getTelemetry: api.getTelemetry }))

import { CircuitTelemetryReplay } from './index'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); api.getTelemetry.mockReset() })
const analysis = JSON.parse(readFileSync(join(__dirname, '../../../../backend/cache/9539/_analysis.json'), 'utf8')) as FullRaceAnalysis

async function show(result: unknown) {
  api.getTelemetry.mockResolvedValue(result)
  render(<CircuitTelemetryReplay sessionKey={9539} analysis={analysis} />)
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

describe('telemetry states', () => {
  it.each([
    ['race_only', /only available for race sessions/],
    ['not_prepared', /has not been prepared/],
    ['no_data', /FastF1 has no telemetry/],
  ])('%s: a reason, no Retry', async (reason, text) => {
    await show({ kind: 'unavailable', reason })
    expect(screen.getByText(text)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(document.querySelector('[data-telemetry-panel]')?.getAttribute('data-telemetry-panel')).toBe('unavailable')
  })

  it('an error offers Retry, and Retry asks again', async () => {
    await show({ kind: 'error' })
    expect(document.querySelector('[data-telemetry-panel]')?.getAttribute('data-telemetry-panel')).toBe('error')
    expect(api.getTelemetry).toHaveBeenCalledTimes(1)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })) })
    expect(api.getTelemetry).toHaveBeenCalledTimes(2)
  })

  it('the states are as tall as the panel with data', () => {
    const css = readFileSync(join(__dirname, 'telemetry.module.css'), 'utf8')
    expect(css).toMatch(/\.state \{ min-height: 1223px;/)
    expect(css).toMatch(/max-width: 800px\) \{ \.state \{ min-height: 2129px; \} \}/)
  })
})

describe('getTelemetry tells unavailable from error', () => {
  const reply = (status: number, body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })))
  const err = (code: string) => ({ error: { code, message: code } })

  it.each([
    [400, err('TELEMETRY_RACE_ONLY'), { kind: 'unavailable', reason: 'race_only' }],
    [503, err('TELEMETRY_NOT_PRECOMPUTED'), { kind: 'unavailable', reason: 'not_prepared' }],
    [404, err('TELEMETRY_UNAVAILABLE'), { kind: 'unavailable', reason: 'no_data' }],
    [404, err('ANALYSIS_NOT_FOUND'), { kind: 'unavailable', reason: 'no_data' }],
    [200, { drivers: [] }, { kind: 'unavailable', reason: 'no_data' }],
    [500, err('INTERNAL_ERROR'), { kind: 'error' }],
    [502, 'bad gateway', { kind: 'error' }],
  ])('%i %j', async (status, body, want) => {
    reply(status, body)
    const { getTelemetry } = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
    expect(await getTelemetry(9539, ['VER'])).toEqual(want)
  })

  it('a network failure is an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const { getTelemetry } = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
    expect(await getTelemetry(9539, ['VER'])).toEqual({ kind: 'error' })
  })
})

describe('block 36: OpenF1 telemetry from R2 first, the API otherwise', () => {
  const file = (codes: string[]) => ({
    circuit_key: 'interlagos_2024', circuit_name: 'Interlagos', year: 2024, session_type: 'Race', circuit_outline: [],
    drivers: codes.map((c) => ({ driver_code: c, team_colour: '#fff', lap_time: 80, fastest_lap_number: 3, lap_mode: 'fastest_clean', points: [], sector_1_time: null, sector_2_time: null, sector_3_time: null })),
    sector_boundaries: { sector_1_end: 1, sector_2_end: 2 }, total_distance: 4309, confidence: 'Medium',
    source: 'OpenF1 car_data + location', note: 'scaled to the official lap length',
  })
  afterEach(() => vi.unstubAllEnvs())
  const load = async () => (await vi.importActual<typeof import('@/lib/api')>('@/lib/api')).getTelemetry

  it('reads the race file from R2 and keeps only the drivers asked for', async () => {
    vi.stubEnv('NEXT_PUBLIC_TELEMETRY_URL', 'https://telemetry.example/')
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify(file(["VER", "NOR", "LEC"])), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await (await load())(9636, ['NOR', 'VER'], 'representative')
    expect(fetchMock.mock.calls[0][0]).toBe('https://telemetry.example/telemetry/v1/9636/representative.json')
    expect(r.kind).toBe('data')
    expect(r.kind === 'data' && r.data.drivers.map((d) => d.driver_code)).toEqual(['VER', 'NOR'])
  })

  it.each([
    ['a 404 on R2', async () => new Response('missing', { status: 404 })],
    ['R2 unreachable', async () => { throw new TypeError('Failed to fetch') }],
    ['none of the drivers in the file', async () => new Response(JSON.stringify(file(['ALO'])), { status: 200 })],
  ])('%s: falls back to the API', async (_, r2) => {
    vi.stubEnv('NEXT_PUBLIC_TELEMETRY_URL', 'https://telemetry.example')
    const api = { ...file(['VER']), source: 'FastF1' }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.startsWith('https://telemetry.example') ? r2() : new Response(JSON.stringify(api), { status: 200 }))))
    const r = await (await load())(9636, ['VER'])
    expect(r.kind === 'data' && r.data.source).toBe('FastF1')
  })

  it('without NEXT_PUBLIC_TELEMETRY_URL, R2 is never asked', async () => {
    vi.stubEnv('NEXT_PUBLIC_TELEMETRY_URL', '')
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ ...file(['VER']), source: 'FastF1' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await (await load())(9636, ['VER'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/telemetry/9636?drivers=VER')
  })

  it('the badge names the source', async () => {
    const { telemetrySource } = await import('./index')
    expect(telemetrySource('OpenF1 car_data + location')).toBe('OpenF1')
    expect(telemetrySource('FastF1')).toBe('FastF1')
    expect(telemetrySource(null)).toBe('FastF1')
  })
})
