// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Block 31, C4: opening the race engineer measured INP 216–472 ms with the
 * CPU throttled four times, and 340 ms of it was `new AudioContext()` for the
 * radio click, created inside the click (the overlay's effect runs before
 * paint). The sounds now wait for the next paint, so the overlay shows first.
 */
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules() })

function fakeAudio() {
  const node = () => ({ connect: vi.fn().mockReturnThis(), start: vi.fn(), stop: vi.fn(), buffer: null, type: '', frequency: { setValueAtTime: vi.fn() }, gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } })
  const Ctor = vi.fn(() => ({
    state: 'running', currentTime: 0, sampleRate: 48000, destination: {},
    createBuffer: () => ({ getChannelData: () => new Float32Array(240) }),
    createBufferSource: node, createGain: node, createOscillator: node, createBiquadFilter: node, resume: vi.fn(),
  }))
  vi.stubGlobal('AudioContext', Ctor)
  return Ctor
}

describe('radio sounds', () => {
  it('do not create the AudioContext before the next paint', async () => {
    vi.useFakeTimers()
    const Ctor = fakeAudio()
    const { playRadioOpen } = await import('./radioFx')
    const done = playRadioOpen()
    expect(Ctor).not.toHaveBeenCalled()          // nothing synchronous in the click
    await vi.advanceTimersByTimeAsync(50)        // a frame and a task later
    await done
    expect(Ctor).toHaveBeenCalledTimes(1)
  })
})
