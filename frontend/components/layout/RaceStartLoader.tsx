'use client'

import { useEffect, useState } from 'react'

/**
 * F1 start-light boot sequence.
 *
 * Mirrors the FIA starting gantry: five columns of paired red lights
 * illuminate one by one, hold, then extinguish simultaneously — "lights out
 * and away we go" — revealing the app underneath with a green go-signal flash.
 *
 * Mounted in the root layout, so it plays on the first full page load and
 * never on client-side navigation (App Router keeps the root layout mounted).
 * The app is only revealed once the sequence has fully played AND the page has
 * finished loading — whichever happens last — so the animation is never cut
 * short on a fast load. Fully skipped for users who prefer reduced motion.
 */

const LIGHT_COUNT = 5
const FIRST_LIGHT_DELAY = 900 // ms before the first column lights
const LIGHT_INTERVAL = 1000 // ms between each column (one beep per second)
const HOLD_AFTER_FULL = 1100 // ms with all lights on before lights-out
const FADE_DURATION = 560 // ms overlay fade-out
const FAILSAFE_MS = 9000 // hard cap so the overlay can never get stuck

// Start-light sound. Drop the file in frontend/public/ → served at this path.
const AUDIO_SRC = '/start-lights.mp3'
const AUDIO_VOLUME = 0.7
// Lights-out lands at FIRST_LIGHT_DELAY + (LIGHT_COUNT-1)*LIGHT_INTERVAL +
// HOLD_AFTER_FULL = 6000ms, matching a ~6s audio clip.

const BOOT_LINES = [
  'INITIALIZING PIT WALL ENGINEER',
  'TELEMETRY BUS · ONLINE',
  'RACE TIMELINE · SYNCED',
  'STRATEGY MODULES · ARMED',
  'GRID READY · STAND BY',
]

// Film-grain texture (retro/vintage). Inline SVG turbulence — no asset needed.
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

function StartLight({ on }: { on: boolean }) {
  return (
    <span
      className="relative block w-9 h-9 md:w-11 md:h-11 rounded-full"
      style={{
        // Chrome bezel ring around the lens
        background: 'linear-gradient(145deg, #4a4f59 0%, #1a1d23 55%, #05060a 100%)',
        padding: 3,
        boxShadow:
          'inset 0 1px 1px rgba(255,255,255,0.35), inset 0 -2px 3px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.7)',
      }}
    >
      {/* Glass lens */}
      <span
        className="block w-full h-full rounded-full transition-all duration-150"
        style={
          on
            ? {
                background:
                  'radial-gradient(circle at 38% 30%, #fff0f0 0%, #ff5566 20%, #E8001D 52%, #7a0010 100%)',
                boxShadow:
                  '0 0 24px 6px rgba(232,0,29,0.6), 0 0 7px 1px rgba(255,90,110,0.85), inset 0 0 8px rgba(110,0,14,0.6)',
              }
            : {
                background:
                  'radial-gradient(circle at 38% 30%, #3a1519 0%, #1b070a 55%, #090304 100%)',
                boxShadow:
                  'inset 0 2px 4px rgba(0,0,0,0.85), inset 0 -1px 2px rgba(80,20,25,0.35)',
              }
        }
      />
      {/* Specular glass highlight */}
      <span
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background:
            'radial-gradient(circle at 34% 24%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 34%)',
        }}
      />
    </span>
  )
}

function Rivet({ className }: { className: string }) {
  return (
    <span
      className={`absolute w-1 h-1 rounded-full ${className}`}
      style={{ background: 'radial-gradient(circle at 40% 35%, #7b828c 0%, #2a2d33 60%, #0d0f12 100%)' }}
    />
  )
}

export function RaceStartLoader() {
  // Default visible so the overlay is present in the very first paint and no
  // app content flashes before the sequence takes over.
  const [active, setActive] = useState(true)
  const [litCount, setLitCount] = useState(0)
  const [extinguished, setExtinguished] = useState(false)
  const [fading, setFading] = useState(false)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    let audio: HTMLAudioElement | null = null
    let revealed = false
    const finish = () => {
      document.body.style.overflow = prevOverflow
      if (audio) {
        audio.pause()
        audio.currentTime = 0
      }
      setActive(false)
    }
    const reveal = () => {
      if (revealed) return
      revealed = true
      setFading(true)
      timers.push(setTimeout(finish, FADE_DURATION))
    }

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      setReduced(true)
      timers.push(setTimeout(reveal, 450))
      return () => {
        timers.forEach(clearTimeout)
        document.body.style.overflow = prevOverflow
      }
    }

    // Start-light audio, synced to the sequence. Browsers may block autoplay
    // with sound before any user interaction — if so, we fail silently and the
    // animation still plays.
    try {
      audio = new Audio(AUDIO_SRC)
      audio.volume = AUDIO_VOLUME
      audio.play().catch(() => {})
    } catch {
      audio = null
    }

    // Light the columns one by one.
    for (let i = 1; i <= LIGHT_COUNT; i++) {
      timers.push(
        setTimeout(() => setLitCount(i), FIRST_LIGHT_DELAY + (i - 1) * LIGHT_INTERVAL),
      )
    }

    const allLitAt = FIRST_LIGHT_DELAY + (LIGHT_COUNT - 1) * LIGHT_INTERVAL
    const outAt = allLitAt + HOLD_AFTER_FULL
    timers.push(setTimeout(() => setExtinguished(true), outAt))

    // Reveal only when the animation is done AND the page has fully loaded.
    let animDone = false
    let pageLoaded = document.readyState === 'complete'
    const maybeReveal = () => {
      if (animDone && pageLoaded) reveal()
    }

    timers.push(
      setTimeout(() => {
        animDone = true
        maybeReveal()
      }, outAt + 160),
    )

    let onLoad: (() => void) | null = null
    if (!pageLoaded) {
      onLoad = () => {
        pageLoaded = true
        maybeReveal()
      }
      window.addEventListener('load', onLoad)
    }

    // Failsafe: never let the overlay stick around forever.
    timers.push(setTimeout(reveal, FAILSAFE_MS))

    return () => {
      timers.forEach(clearTimeout)
      if (onLoad) window.removeEventListener('load', onLoad)
      if (audio) audio.pause()
      document.body.style.overflow = prevOverflow
    }
  }, [])

  if (!active) return null

  const line = extinguished
    ? 'LIGHTS OUT — AND AWAY WE GO'
    : BOOT_LINES[Math.min(litCount, BOOT_LINES.length - 1)]

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-bg-primary overflow-hidden"
      style={{
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_DURATION}ms ease-out`,
      }}
      aria-hidden="true"
    >
      {/* Grid + vignette to match the app's surface */}
      <div className="absolute inset-0 bg-grid-pattern bg-grid opacity-40 pointer-events-none" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 55% at 50% 45%, transparent 25%, #05060A 100%)',
        }}
      />

      {/* Retro film grain + scanlines */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.07] mix-blend-overlay"
        style={{ backgroundImage: GRAIN, backgroundSize: '140px 140px' }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.5]"
        style={{
          background:
            'repeating-linear-gradient(0deg, rgba(0,0,0,0.16) 0px, rgba(0,0,0,0.16) 1px, transparent 1px, transparent 3px)',
        }}
      />

      {/* Green go-signal flash on lights-out */}
      {extinguished && !reduced && (
        <div className="absolute inset-0 pointer-events-none bg-signal-green/10 animate-[pwGoFlash_0.6s_ease-out_forwards]" />
      )}

      <div className="relative z-10 flex flex-col items-center px-6">
        {/* Brand */}
        <div className="flex items-center gap-2 mb-10">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              extinguished ? 'bg-signal-green' : 'bg-signal-red'
            } animate-pulse`}
          />
          <span className="font-display font-black text-[13px] md:text-[15px] uppercase tracking-[3px] text-text-primary">
            Pit Wall Engineer
          </span>
        </div>

        {/* Starting gantry */}
        {!reduced && (
          <div className="relative">
            {/* Mounting bar */}
            <div className="mx-auto mb-2 h-[6px] w-[92%] rounded-[2px]"
              style={{
                background: 'linear-gradient(180deg, #30343c 0%, #171a1f 60%, #0a0b0e 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), 0 2px 4px rgba(0,0,0,0.6)',
              }}
            />

            <div className="flex items-start gap-2.5 md:gap-3.5">
              {Array.from({ length: LIGHT_COUNT }).map((_, col) => {
                const on = !extinguished && col < litCount
                return (
                  <div
                    key={col}
                    className="relative flex flex-col gap-2 rounded-[6px] p-2"
                    style={{
                      background:
                        'linear-gradient(155deg, #23272f 0%, #12141a 45%, #0a0b0f 100%)',
                      border: '1px solid rgba(255,255,255,0.05)',
                      boxShadow:
                        'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -3px 6px rgba(0,0,0,0.7), 0 6px 16px rgba(0,0,0,0.55)',
                    }}
                  >
                    {/* Brushed-metal sheen */}
                    <span
                      className="pointer-events-none absolute inset-0 rounded-[6px] opacity-[0.05]"
                      style={{
                        background:
                          'repeating-linear-gradient(90deg, #fff 0px, #fff 1px, transparent 1px, transparent 3px)',
                      }}
                    />
                    {/* Corner rivets */}
                    <Rivet className="left-1 top-1" />
                    <Rivet className="right-1 top-1" />
                    <Rivet className="left-1 bottom-1" />
                    <Rivet className="right-1 bottom-1" />

                    <StartLight on={on} />
                    <StartLight on={on} />
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Boot status line */}
        <div className="mt-10 h-4 flex items-center">
          <span
            className={`font-mono text-[11px] tracking-[1px] tabular-nums ${
              extinguished ? 'text-signal-green' : 'text-text-secondary'
            }`}
          >
            {line}
          </span>
          <span
            className={`ml-1 font-mono text-[11px] ${
              extinguished ? 'text-signal-green' : 'text-signal-red'
            } animate-pulse`}
          >
            _
          </span>
        </div>
      </div>
    </div>
  )
}
