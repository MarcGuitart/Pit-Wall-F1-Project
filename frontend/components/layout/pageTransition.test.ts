import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { arrivalPlan } from '@/lib/arrival'

// Block 27, task 7: the page transition is block 26's, unchanged — entry only,
// 180 ms, 8 px, the spec's easing — and it never runs together with arrival.
const css = readFileSync(join(__dirname, 'shell.module.css'), 'utf8')

describe('page transition', () => {
  it('is 180 ms with an 8 px rise and the out easing, entry only', () => {
    expect(css).toMatch(/\.enter main \{ animation: pwEnter 180ms cubic-bezier\(0\.2, 0, 0, 1\); \}/)
    expect(css).toMatch(/from \{ opacity: 0; transform: translateY\(8px\); \}/)
    expect(css).not.toMatch(/pwExit|\.leave\b/)
  })

  it('is not doubled by arrival: an answer before the loader shows has no arrival', () => {
    expect(arrivalPlan(0, 250).animate).toBe(false)
  })
})
