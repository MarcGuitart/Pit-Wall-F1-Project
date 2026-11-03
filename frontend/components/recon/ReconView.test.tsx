// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ReconView } from './ReconView'
import type { Recon } from './data'

vi.mock('@/components/layout/AppShell', () => ({ AppShell: ({ children }: { children: unknown }) => children }))

const data = JSON.parse(readFileSync(join(__dirname, '..', '..', 'public', 'recon', 'interlagos.json'), 'utf8')) as Recon

// ?still=1: no scene, so the tour is the panel, the buttons and the keys (the WebGL stage is checked in a real browser)
beforeEach(() => {
  window.history.replaceState({}, '', '/recon/interlagos?still=1')
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
})
afterEach(cleanup)

const zoneNo = () => document.querySelector('section[aria-label="Braking zone"] [class*=zoneNo]')!.textContent
const panel = () => document.querySelector('section[aria-label="Braking zone"]') as HTMLElement

describe('Recon Lap zone tour', () => {
  it('opens on BZ1 with the measured figures, the sampling label and the reference session', () => {
    render(<ReconView recon={data} />)
    expect(zoneNo()).toBe('BZ1')
    const z = data.zones[0]
    expect(panel().textContent).toContain(String(z.fromSpeed))
    expect(panel().textContent).toContain(String(z.minSpeed))
    expect(panel().textContent).toContain(`${Math.round(z.to - z.from)}m`)
    expect(panel().textContent).toMatch(/Approximate\. Car data sampled at about 3\.9 Hz/)
    expect(panel().textContent).toContain('Lando Norris')
    expect(panel().textContent).toContain(`OpenF1 session ${data.session_key}`)
  })

  it('the arrow keys and the buttons move between zones, and wrap around the lap', () => {
    render(<ReconView recon={data} />)
    const stage = screen.getByRole('group', { name: /braking zones/i })
    fireEvent.keyDown(stage, { key: 'ArrowRight' })
    expect(zoneNo()).toBe('BZ2')
    fireEvent.keyDown(stage, { key: 'ArrowLeft' })
    fireEvent.keyDown(stage, { key: 'ArrowLeft' })
    expect(zoneNo()).toBe(`BZ${data.zones.length}`)
    fireEvent.click(screen.getByRole('button', { name: 'Next zone' }))
    expect(zoneNo()).toBe('BZ1')
    fireEvent.click(screen.getByRole('button', { name: 'Previous zone' }))
    expect(zoneNo()).toBe(`BZ${data.zones.length}`)
    fireEvent.keyDown(stage, { key: 'Home' })
    expect(zoneNo()).toBe('BZ1')
    fireEvent.keyDown(stage, { key: 'End' })
    expect(zoneNo()).toBe(`BZ${data.zones.length}`)
  })

  it('the table rows jump to their zone, and modified arrows are left to the browser', () => {
    render(<ReconView recon={data} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show zone 4' }))
    expect(zoneNo()).toBe('BZ4')
    fireEvent.keyDown(screen.getByRole('group', { name: /braking zones/i }), { key: 'ArrowRight', altKey: true })
    expect(zoneNo()).toBe('BZ4')
  })

  it('announces a zone change politely, and nothing plays by itself', () => {
    render(<ReconView recon={data} />)
    const status = screen.getByRole('status')
    expect(status.textContent).toMatch(/^Braking zone 1 of 7\. Entry speed 336 kilometres per hour, minimum speed 110/)
    fireEvent.click(screen.getByRole('button', { name: 'Next zone' }))
    expect(status.textContent).toMatch(/^Braking zone 2 of 7\. Entry speed 310/)
    expect(screen.queryByRole('button', { name: /pause lap/i })).toBeNull()
  })

  it('shows no invented time on the brakes for a lap without a brake signal', () => {
    const z = data.zones.map((zz) => ({ ...zz, seconds: null }))
    render(<ReconView recon={{ ...data, zones_by: 'speed', zones: z }} />)
    expect(panel().textContent).toContain('n/a')
    expect(panel().textContent).toContain('No brake signal on this lap')
  })
})
