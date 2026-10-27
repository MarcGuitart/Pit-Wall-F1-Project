// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const api = vi.hoisted(() => ({ redeemAccessCode: vi.fn(async () => ({ token: 't', expires_at: 1 })) }))
vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), redeemAccessCode: api.redeemAccessCode }))
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }))

import { LiveProWall } from './LiveProWall'

/** Block 43: /live's PRO wall in the system's style, its own copy, Settings' code form. */
afterEach(cleanup)

describe('LiveProWall', () => {
  it('says what live mode is and what PRO covers', () => {
    render(<LiveProWall onUnlocked={() => {}} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Live mode is PRO')
    expect(screen.getByText('Live mode and races from 2025 are part of PRO.')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/[—–]|\S - \S/)
  })

  it('unlocks through the access-code form Settings uses', async () => {
    const unlocked = vi.fn()
    render(<LiveProWall onUnlocked={unlocked} />)
    fireEvent.change(screen.getByLabelText(/access code/i), { target: { value: 'PW-TEST' } })
    fireEvent.submit(screen.getByLabelText(/access code/i).closest('form')!)
    await vi.waitFor(() => expect(unlocked).toHaveBeenCalled())
    expect(api.redeemAccessCode).toHaveBeenCalledWith('PW-TEST')
  })

  it('the live page uses it, not the classic wall', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const page = readFileSync(join(__dirname, '../../app/live/[sessionKey]/page.tsx'), 'utf8')
    expect(page).toContain('<LiveProWall')
    expect(page).not.toMatch(/<ProWall\b/)
  })
})
