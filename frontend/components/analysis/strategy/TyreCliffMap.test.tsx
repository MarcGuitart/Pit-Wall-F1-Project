// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { TyreDegradationRow } from '@/types'
import { TyreCliffMap } from './TyreCliffMap'

afterEach(cleanup)

const row = (code: string, slope: number) => ({ driver_code: code, degradation_slope: slope, compound: 'HARD' }) as TyreDegradationRow

describe('TyreCliffMap', () => {
  it('shows a negative slope with a single minus sign', () => {
    render(<TyreCliffMap degradationRows={[row('ZHO', -0.011), row('SAI', 0.079)]} onDriverClick={() => undefined} sessionType="Race" />)
    expect(screen.getByText('-0.011')).toBeTruthy()
    expect(screen.getByText('+0.079')).toBeTruthy()
    expect(screen.queryByText(/\+-/)).toBeNull()
  })
})
