import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// PARITY.md lists the old live components left for the second deploy
// (block 43). Every file it names must exist, so the list stays honest as
// components are migrated or deleted.
const root = join(__dirname, '..')
const parity = readFileSync(join(root, 'PARITY.md'), 'utf8')
const section = parity.split('### Live: componentes del diseño antiguo, para el segundo deploy')[1]?.split('\n### ')[0] ?? ''

describe('PARITY.md live backlog', () => {
  it('exists and names the old live components', () => {
    for (const name of ['PracticePitWall', 'PositionTower', 'LiveEngineerNotes', 'PitWindowWatch', 'PitCyclesLive', 'ChaosDensityMeter', 'RadioFeed', 'TrackStatusBanner', 'ConnectionBanner', 'WaitingForFeed', 'ProWall']) {
      expect(section).toContain(name)
    }
  })
  it('points only at files that exist', () => {
    const paths = Array.from(section.matchAll(/`((?:components|app)\/[^`]+\.tsx)`/g), (m) => m[1])
    expect(paths.length).toBeGreaterThan(9)
    for (const p of paths) expect(existsSync(join(root, p)), p).toBe(true)
  })
})
