import { describe, expect, it } from 'vitest'
import { formatSignedSlope, formatSlope } from './format'

describe('degradation slopes', () => {
  it('signs a slope once: positive with +, negative with its own minus', () => {
    expect(formatSignedSlope(0.079)).toBe('+0.079')
    expect(formatSignedSlope(-0.011)).toBe('-0.011')
    expect(formatSignedSlope(0)).toBe('+0.000')
  })
  it('never prints "+-" (Tyre Cliff Map used to)', () => {
    for (const x of [-0.5, -0.011, -0.0004]) expect(formatSignedSlope(x)).not.toContain('+-')
  })
  it('formatSlope is the same number with its unit', () => {
    expect(formatSlope(-0.011)).toBe('-0.011s/lap')
  })
})
