'use client'

/**
 * F1 engine sound synthesiser — Web Audio API only, no network requests.
 *
 * Architecture:
 *   oscillator (sawtooth) → waveshaper (distortion) → gain → output
 *
 * Frequency is driven by speed + gear to approximate engine RPM pitch.
 * Amplitude is driven by throttle (0–100) and cut quickly on braking.
 */

let ctx: AudioContext | null = null
let osc: OscillatorNode | null = null
let shaper: WaveShaperNode | null = null
let gainNode: GainNode | null = null
let masterGain: GainNode | null = null

function getCtx(): AudioContext {
  if (!ctx || ctx.state === 'closed') {
    ctx = new AudioContext()
  }
  return ctx
}

function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 256
  const curve = new Float32Array(new ArrayBuffer(samples * 4))
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x))
  }
  return curve
}

/**
 * Estimate engine frequency from speed + gear.
 * F1 engine idles ~8 kRPM, redline ~18 kRPM.
 * We map to audible 60–220 Hz (this is ~50–60th harmonic).
 */
function engineFreq(speed: number, gear: number): number {
  const gearRatio = [1.0, 0.85, 0.72, 0.62, 0.54, 0.47, 0.42, 0.38][Math.min(gear, 7)]
  const rawRpm = Math.max(0, speed) / Math.max(1, gearRatio)
  return 60 + (rawRpm / 380) * 160
}

export function initEngineSound(): void {
  if (osc) return // already initialised
  const audioCtx = getCtx()

  osc = audioCtx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.value = 60

  shaper = audioCtx.createWaveShaper()
  shaper.curve = makeDistortionCurve(80)
  shaper.oversample = '4x'

  gainNode = audioCtx.createGain()
  gainNode.gain.value = 0

  masterGain = audioCtx.createGain()
  masterGain.gain.value = 0.12 // keep it subtle

  osc.connect(shaper)
  shaper.connect(gainNode)
  gainNode.connect(masterGain)
  masterGain.connect(audioCtx.destination)
  osc.start()
}

export function updateEngineSound(
  speed: number,
  throttle: number,
  brake: boolean,
  gear: number,
): void {
  if (!osc || !gainNode || !ctx) return
  if (ctx.state === 'suspended') ctx.resume()

  const now = ctx.currentTime
  const freq = engineFreq(speed, gear)
  const amplitude = brake ? 0.02 : (throttle / 100) * 0.9 + 0.1

  osc.frequency.setTargetAtTime(freq, now, 0.05)
  gainNode.gain.setTargetAtTime(amplitude, now, brake ? 0.02 : 0.08)
}

export function stopEngineSound(): void {
  if (!gainNode || !ctx) return
  gainNode.gain.setTargetAtTime(0, ctx.currentTime, 0.15)
}

export function destroyEngineSound(): void {
  stopEngineSound()
  setTimeout(() => {
    osc?.stop()
    osc?.disconnect()
    osc = null
    shaper?.disconnect()
    shaper = null
    gainNode?.disconnect()
    gainNode = null
    masterGain?.disconnect()
    masterGain = null
  }, 400)
}

export function setEngineMasterVolume(vol: number): void {
  if (!masterGain || !ctx) return
  masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, vol)) * 0.12, ctx.currentTime, 0.05)
}
