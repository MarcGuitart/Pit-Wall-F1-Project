import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Block 32 addendum 3: no Next.js build output in git. frontend/.next.stale/
 * (26 files of an old build, with absolute paths of a developer's machine)
 * was tracked since "MVP Ready"; it is removed and both .gitignore files
 * cover .next* now.
 */
const FRONTEND = join(__dirname, '..')

describe('build output', () => {
  it('nothing under frontend/.next* is tracked', () => {
    const tracked = execSync('git ls-files -- ".next*"', { cwd: FRONTEND, encoding: 'utf8' }).trim()
    expect(tracked).toBe('')
  })

  it('both .gitignore files cover .next*', () => {
    expect(readFileSync(join(FRONTEND, '.gitignore'), 'utf8')).toMatch(/^\/\.next\*$/m)
    expect(readFileSync(join(FRONTEND, '..', '.gitignore'), 'utf8')).toMatch(/^frontend\/\.next\*$/m)
  })
})
