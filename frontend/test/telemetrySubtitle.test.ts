import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The telemetry tab's fixed subtitle must not name a source: the laps come from
 * R2 (OpenF1) or from the API (FastF1), and the badge beside the controls says
 * which (CircuitTelemetryReplay, block 36). A fixed "FastF1" was false for R2.
 */
describe('telemetry tab subtitle', () => {
  it('names no source, the badge does', () => {
    const src = readFileSync(join(__dirname, '..', 'components/analysis/tabs/TelemetryTab.tsx'), 'utf8')
    expect(src).toContain('Fastest clean lap · SVG replay')
    expect(src).not.toMatch(/FastF1/)
  })
})
