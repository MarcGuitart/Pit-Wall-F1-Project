'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Two-phase boot experience:
 *
 * PHASE 1 — Gate screen with an FIA-style "Start Race Analysis" button.
 *   The user click is required so the browser allows audio autoplay.
 *
 * PHASE 2 — F1 start-light gantry sequence (5 red lights, one per second)
 *   with synced audio.  When the lights go out the app is revealed.
 *
 * Mounted once in the root layout; never replays on client-side navigation.
 * Respects prefers-reduced-motion: skip straight to the app with a short fade.
 */

// ── Timing ──────────────────────────────────────────────────────────────────
const LIGHT_COUNT = 5
const FIRST_LIGHT_DELAY = 900   // ms before column 1 lights
const LIGHT_INTERVAL = 1000     // ms between columns — syncs to 1-beep-per-second audio
const HOLD_AFTER_FULL = 1100    // ms all-lit hold before lights-out
const FADE_DURATION = 600       // ms overlay fade-out
const FAILSAFE_MS = 9000        // hard cap — overlay can never get stuck

// Lights-out at: 900 + 4×1000 + 1100 = 6000 ms → matches a ~6 s audio clip.

const AUDIO_SRC = '/start-lights.mp3'
const AUDIO_VOLUME = 0.7

// ── Copy ────────────────────────────────────────────────────────────────────
const BOOT_LINES = [
  'INITIALIZING PIT WALL ENGINEER',
  'TELEMETRY BUS · ONLINE',
  'RACE TIMELINE · SYNCED',
  'STRATEGY MODULES · ARMED',
  'GRID READY · STAND BY',
]

// ── Film-grain texture (inline SVG, no asset needed) ────────────────────────
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

// ── Shared overlay background ────────────────────────────────────────────────
function OverlayBg({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-bg-primary overflow-hidden">
      <div className="absolute inset-0 bg-grid-pattern bg-grid opacity-40 pointer-events-none" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 55% at 50% 45%, transparent 25%, #05060A 100%)' }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.07] mix-blend-overlay"
        style={{ backgroundImage: GRAIN, backgroundSize: '140px 140px' }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.45]"
        style={{ background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.16) 0px, rgba(0,0,0,0.16) 1px, transparent 1px, transparent 3px)' }}
      />
      {children}
    </div>
  )
}

// ── Brand strip ──────────────────────────────────────────────────────────────
function Brand({ green = false }: { green?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${green ? 'bg-signal-green' : 'bg-signal-red'}`} />
      <span className="font-display font-black text-[13px] md:text-[15px] uppercase tracking-[3px] text-text-primary">
        Pit Wall Engineer
      </span>
    </div>
  )
}

// ── FIA-style start button ───────────────────────────────────────────────────
// Fake telemetry data lines — same visual language as the dashboard's mono readouts
const STATUS_ROWS = [
  { label: 'TELEMETRY BUS',   value: 'ONLINE',       color: '#23D18B' },
  { label: 'ANALYSIS ENGINE', value: 'ARMED',        color: '#23D18B' },
  { label: 'SESSION CACHE',   value: 'READY',        color: '#23D18B' },
  { label: 'OPENF1 STREAM',   value: 'CONNECTED',    color: '#4DA3FF' },
  { label: 'CHAOS INDEX',     value: 'CALIBRATING',  color: '#FFB020' },
]

function FIAButton({ onPress }: { onPress: () => void }) {
  const [pressing, setPressing] = useState(false)

  const handlePress = () => {
    setPressing(true)
    onPress()
  }

  return (
    <div className="w-full max-w-md flex flex-col items-center gap-8 px-4">

      {/* Brand */}
      <Brand />

      {/* Dashboard status panel — same panel/border language as the app */}
      <div
        className="w-full rounded-[4px] border overflow-hidden"
        style={{ borderColor: '#1E2430', background: '#111419' }}
      >
        {/* Panel header */}
        <div
          className="flex items-center justify-between px-3 py-2 border-b"
          style={{ borderColor: '#1E2430', background: '#0B0D12' }}
        >
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse" />
            <span className="font-display font-bold text-[9px] uppercase tracking-[1.5px] text-text-muted">
              System Status
            </span>
          </div>
          <span className="font-mono text-[9px] text-text-muted tabular-nums">PWE · v4</span>
        </div>

        {/* Status rows */}
        <div className="divide-y" style={{ borderColor: '#1E2430' }}>
          {STATUS_ROWS.map(({ label, value, color }) => (
            <div key={label} className="flex items-center justify-between px-3 py-2">
              <span className="font-mono text-[9px] uppercase tracking-[1px] text-text-muted">{label}</span>
              <span className="font-mono text-[9px] uppercase tracking-[1px]" style={{ color }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* FIA button */}
      <div className="relative flex items-center justify-center">
        {/* Pulsing invitation ring */}
        <span
          className="absolute rounded-full animate-ping opacity-15"
          style={{
            width: 192, height: 192,
            background: 'radial-gradient(circle, #E8001D 0%, transparent 70%)',
            animationDuration: '2.4s',
          }}
        />

        {/* Chrome mounting plate */}
        <button
          onPointerDown={handlePress}
          aria-label="Start Race Analysis"
          className="relative focus:outline-none select-none cursor-pointer"
          style={{
            width: 168, height: 168, borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 30%, #4a4f5a 0%, #25292f 40%, #141719 75%, #08090c 100%)',
            boxShadow: pressing
              ? 'inset 0 5px 14px rgba(0,0,0,0.95), 0 2px 6px rgba(0,0,0,0.8)'
              : 'inset 0 -2px 0 rgba(255,255,255,0.05), 0 10px 40px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.04)',
            transform: pressing ? 'scale(0.962) translateY(3px)' : 'scale(1)',
            transition: 'transform 80ms ease-out, box-shadow 80ms ease-out',
            padding: 10,
          }}
        >
          {/* Inner chrome collar */}
          <span
            className="absolute inset-[10px] rounded-full"
            style={{
              background: 'linear-gradient(150deg, #383d46 0%, #1a1d22 55%, #0c0e11 100%)',
              boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.75), inset 0 -1px 0 rgba(255,255,255,0.07)',
            }}
          />

          {/* Red face */}
          <span
            className="absolute inset-[18px] rounded-full flex flex-col items-center justify-center gap-0.5"
            style={{
              background: pressing
                ? 'radial-gradient(circle at 50% 58%, #a8001a 0%, #7e000e 55%, #4e0009 100%)'
                : 'radial-gradient(circle at 37% 30%, #ff3f52 0%, #E8001D 40%, #940012 78%, #4e0009 100%)',
              boxShadow: pressing
                ? 'inset 0 5px 14px rgba(0,0,0,0.65)'
                : 'inset 0 -3px 9px rgba(0,0,0,0.45), inset 0 2px 5px rgba(255,110,120,0.25), 0 0 22px 5px rgba(232,0,29,0.35)',
              transition: 'background 80ms ease-out, box-shadow 80ms ease-out',
            }}
          >
            {/* Glass dome specular */}
            <span
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{ background: 'radial-gradient(circle at 35% 25%, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0) 44%)' }}
            />
            <span className="relative font-display font-black text-[11px] uppercase tracking-[1.5px] text-white/90 leading-none">
              Start
            </span>
            <span className="relative font-display font-bold text-[8px] uppercase tracking-[1px] text-white/60 leading-none mt-0.5">
              Race Analysis
            </span>
          </span>

          {[{ t: 11, l: 11 }, { t: 11, r: 11 }, { b: 11, l: 11 }, { b: 11, r: 11 }].map((pos, i) => (
            <span
              key={i}
              className="absolute"
              style={{
                ...pos, width: 5, height: 5, borderRadius: '50%',
                background: 'radial-gradient(circle at 35% 30%, #5e666f 0%, #22252a 70%)',
              }}
            />
          ))}
        </button>
      </div>

      {/* Tap hint */}
      <span className="font-mono text-[9px] uppercase tracking-[2.5px] text-text-muted opacity-60 animate-pulse">
        Press to enter
      </span>
    </div>
  )
}

// ── Single start light (bezel + lens) ────────────────────────────────────────
function StartLight({ on }: { on: boolean }) {
  return (
    <span
      className="relative block w-9 h-9 md:w-11 md:h-11 rounded-full"
      style={{
        background: 'linear-gradient(145deg, #4a4f59 0%, #1a1d23 55%, #05060a 100%)',
        padding: 3,
        boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.35), inset 0 -2px 3px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.7)',
      }}
    >
      <span
        className="block w-full h-full rounded-full transition-all duration-150"
        style={on
          ? {
              background: 'radial-gradient(circle at 38% 30%, #fff0f0 0%, #ff5566 20%, #E8001D 52%, #7a0010 100%)',
              boxShadow: '0 0 24px 6px rgba(232,0,29,0.6), 0 0 7px 1px rgba(255,90,110,0.85), inset 0 0 8px rgba(110,0,14,0.6)',
            }
          : {
              background: 'radial-gradient(circle at 38% 30%, #3a1519 0%, #1b070a 55%, #090304 100%)',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.85), inset 0 -1px 2px rgba(80,20,25,0.35)',
            }
        }
      />
      <span
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ background: 'radial-gradient(circle at 34% 24%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 34%)' }}
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

// ── Root component ───────────────────────────────────────────────────────────
export function RaceStartLoader() {
  const [phase, setPhase] = useState<'gate' | 'sequence'>('gate')
  const [active, setActive] = useState(true)
  const [litCount, setLitCount] = useState(0)
  const [extinguished, setExtinguished] = useState(false)
  const [fading, setFading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Gate → sequence transition
  const handleStart = () => {
    // Start audio immediately on user gesture (unlocks autoplay in all browsers)
    try {
      const audio = new Audio(AUDIO_SRC)
      audio.volume = AUDIO_VOLUME
      audioRef.current = audio
      audio.play().catch(() => {})
    } catch {
      audioRef.current = null
    }
    setPhase('sequence')
  }

  // Sequence logic — runs only once phase becomes 'sequence'
  useEffect(() => {
    if (phase !== 'sequence') return

    const timers: ReturnType<typeof setTimeout>[] = []
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      timers.push(setTimeout(() => setFading(true), 400))
      timers.push(setTimeout(() => {
        document.body.style.overflow = prevOverflow
        setActive(false)
      }, 400 + FADE_DURATION))
      return () => { timers.forEach(clearTimeout); document.body.style.overflow = prevOverflow }
    }

    for (let i = 1; i <= LIGHT_COUNT; i++) {
      timers.push(setTimeout(() => setLitCount(i), FIRST_LIGHT_DELAY + (i - 1) * LIGHT_INTERVAL))
    }

    const allLitAt = FIRST_LIGHT_DELAY + (LIGHT_COUNT - 1) * LIGHT_INTERVAL
    const outAt = allLitAt + HOLD_AFTER_FULL
    timers.push(setTimeout(() => setExtinguished(true), outAt))

    let revealed = false
    let animDone = false
    let pageLoaded = document.readyState === 'complete'

    const finish = () => {
      document.body.style.overflow = prevOverflow
      if (audioRef.current) audioRef.current.pause()
      setActive(false)
    }
    const reveal = () => {
      if (revealed) return
      revealed = true
      setFading(true)
      timers.push(setTimeout(finish, FADE_DURATION))
    }
    const maybeReveal = () => { if (animDone && pageLoaded) reveal() }

    timers.push(setTimeout(() => { animDone = true; maybeReveal() }, outAt + 160))

    let onLoad: (() => void) | null = null
    if (!pageLoaded) {
      onLoad = () => { pageLoaded = true; maybeReveal() }
      window.addEventListener('load', onLoad)
    }

    timers.push(setTimeout(reveal, FAILSAFE_MS))

    return () => {
      timers.forEach(clearTimeout)
      if (onLoad) window.removeEventListener('load', onLoad)
      if (audioRef.current) audioRef.current.pause()
      document.body.style.overflow = prevOverflow
    }
  }, [phase])

  if (!active) return null

  // ── Gate screen ─────────────────────────────────────────────────────────
  if (phase === 'gate') {
    return (
      <OverlayBg>
        <div className="relative z-10">
          <FIAButton onPress={handleStart} />
        </div>
      </OverlayBg>
    )
  }

  // ── Sequence screen ──────────────────────────────────────────────────────
  const line = extinguished
    ? 'LIGHTS OUT — AND AWAY WE GO'
    : BOOT_LINES[Math.min(litCount, BOOT_LINES.length - 1)]

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-bg-primary overflow-hidden"
      style={{ opacity: fading ? 0 : 1, transition: `opacity ${FADE_DURATION}ms ease-out` }}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-grid-pattern bg-grid opacity-40 pointer-events-none" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 55% at 50% 45%, transparent 25%, #05060A 100%)' }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.07] mix-blend-overlay"
        style={{ backgroundImage: GRAIN, backgroundSize: '140px 140px' }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.45]"
        style={{ background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.16) 0px, rgba(0,0,0,0.16) 1px, transparent 1px, transparent 3px)' }}
      />
      {extinguished && (
        <div className="absolute inset-0 pointer-events-none bg-signal-green/10 animate-[pwGoFlash_0.6s_ease-out_forwards]" />
      )}

      <div className="relative z-10 flex flex-col items-center px-6">
        <div className="mb-10">
          <Brand green={extinguished} />
        </div>

        {/* Starting gantry */}
        <div className="relative">
          <div
            className="mx-auto mb-2 h-[6px] w-[92%] rounded-[2px]"
            style={{
              background: 'linear-gradient(180deg, #30343c 0%, #171a1f 60%, #0a0b0e 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), 0 2px 4px rgba(0,0,0,0.6)',
            }}
          />
          <div className="flex items-start gap-2.5 md:gap-3.5">
            {Array.from({ length: LIGHT_COUNT }).map((_, col) => (
              <div
                key={col}
                className="relative flex flex-col gap-2 rounded-[6px] p-2"
                style={{
                  background: 'linear-gradient(155deg, #23272f 0%, #12141a 45%, #0a0b0f 100%)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -3px 6px rgba(0,0,0,0.7), 0 6px 16px rgba(0,0,0,0.55)',
                }}
              >
                <span
                  className="pointer-events-none absolute inset-0 rounded-[6px] opacity-[0.05]"
                  style={{ background: 'repeating-linear-gradient(90deg, #fff 0px, #fff 1px, transparent 1px, transparent 3px)' }}
                />
                <Rivet className="left-1 top-1" />
                <Rivet className="right-1 top-1" />
                <Rivet className="left-1 bottom-1" />
                <Rivet className="right-1 bottom-1" />
                <StartLight on={!extinguished && col < litCount} />
                <StartLight on={!extinguished && col < litCount} />
              </div>
            ))}
          </div>
        </div>

        {/* Status line */}
        <div className="mt-10 h-4 flex items-center">
          <span className={`font-mono text-[11px] tracking-[1px] tabular-nums ${extinguished ? 'text-signal-green' : 'text-text-secondary'}`}>
            {line}
          </span>
          <span className={`ml-1 font-mono text-[11px] animate-pulse ${extinguished ? 'text-signal-green' : 'text-signal-red'}`}>_</span>
        </div>
      </div>
    </div>
  )
}
