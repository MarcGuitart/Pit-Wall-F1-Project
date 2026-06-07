// Pure Web Audio API — no external assets, no imports.
// All functions fail silently on any error.

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  }
  return audioCtx
}

export function isAudioEnabled(): boolean {
  try {
    return localStorage.getItem('pitwall_audio') !== 'false'
  } catch {
    return true
  }
}

export function setAudioEnabled(enabled: boolean): void {
  try {
    localStorage.setItem('pitwall_audio', enabled ? 'true' : 'false')
  } catch {
    // storage may be unavailable
  }
}

// Short click + two beeps — total ~400ms
export async function playRadioOpen(): Promise<void> {
  if (!isAudioEnabled()) return
  try {
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') await ctx.resume()

    const now = ctx.currentTime

    // Click transient — 5ms white noise burst
    const bufLen = Math.floor(ctx.sampleRate * 0.005)
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * 0.4
    const click = ctx.createBufferSource()
    click.buffer = buf
    const clickGain = ctx.createGain()
    clickGain.gain.setValueAtTime(0.4, now)
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02)
    click.connect(clickGain).connect(ctx.destination)
    click.start(now)

    // Beep 1 — 880 Hz, 80ms
    const osc1 = ctx.createOscillator()
    osc1.type = 'square'
    osc1.frequency.setValueAtTime(880, now + 0.03)
    const g1 = ctx.createGain()
    g1.gain.setValueAtTime(0.12, now + 0.03)
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.11)
    osc1.connect(g1).connect(ctx.destination)
    osc1.start(now + 0.03)
    osc1.stop(now + 0.11)

    // Beep 2 — 1100 Hz, 80ms
    const osc2 = ctx.createOscillator()
    osc2.type = 'square'
    osc2.frequency.setValueAtTime(1100, now + 0.16)
    const g2 = ctx.createGain()
    g2.gain.setValueAtTime(0.10, now + 0.16)
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.24)
    osc2.connect(g2).connect(ctx.destination)
    osc2.start(now + 0.16)
    osc2.stop(now + 0.24)
  } catch {
    // fail silently — audio never breaks the app
  }
}

// Single descending click — ~140ms
export async function playRadioClose(): Promise<void> {
  if (!isAudioEnabled()) return
  try {
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') await ctx.resume()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.setValueAtTime(660, now)
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.12)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.08, now)
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.14)
    osc.connect(g).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.14)
  } catch {
    // fail silently
  }
}

// Soft single beep when message arrives — ~70ms
export async function playMessageReceived(): Promise<void> {
  if (!isAudioEnabled()) return
  try {
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') await ctx.resume()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.frequency.setValueAtTime(1200, now)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.05, now)
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.06)
    osc.connect(g).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.07)
  } catch {
    // fail silently
  }
}
