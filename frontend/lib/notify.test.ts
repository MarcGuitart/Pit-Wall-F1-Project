import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addWatch, getWatches, isWatching, removeWatch } from './notify'

describe('notify watches', () => {
  const store: Record<string, string> = {}
  beforeEach(() => {
    vi.stubGlobal('window', {
      localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v } },
      dispatchEvent: () => true, addEventListener: () => undefined, removeEventListener: () => undefined,
      Notification: {},
    })
    vi.stubGlobal('Event', class { constructor(public type: string) {} })
  })
  afterEach(() => { vi.unstubAllGlobals(); for (const k of Object.keys(store)) delete store[k] })

  it('asks for permission and keeps one watch per id', async () => {
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: async () => 'granted' })
    const w = { kind: 'live' as const, id: 'live-x', label: 'KL Race', startsAt: '2026-10-04T07:00:00Z' }
    expect(await addWatch(w)).toBe('set')
    expect(await addWatch(w)).toBe('set')
    expect(getWatches()).toHaveLength(1)
    expect(isWatching('live-x')).toBe(true)
    removeWatch('live-x')
    expect(getWatches()).toHaveLength(0)
  })

  it('does not store a watch when notifications are denied', async () => {
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission: async () => 'denied' })
    expect(await addWatch({ kind: 'live', id: 'y', label: 'y', startsAt: null })).toBe('denied')
    expect(getWatches()).toHaveLength(0)
  })
})
