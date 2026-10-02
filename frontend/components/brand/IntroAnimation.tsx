'use client'

/**
 * The home page's opening animation: the car silhouette appears small at the
 * center and grows to fill the screen, then gives way to the page underneath.
 *
 * Performance (Block 24 Task 4): the home page's real content renders and
 * paints normally the whole time, underneath this overlay — nothing here
 * delays data fetching, hydration or the page's own LCP candidate. The
 * overlay only covers it visually for its own ~1.4s, on top, via
 * position:fixed; when it goes away the already-painted content is simply
 * revealed, not rendered for the first time. Only `transform` and `opacity`
 * are animated (both GPU-composited); nothing here ever animates a layout
 * property (width/height/top/left).
 *
 * Shown once per browser session (sessionStorage) — a reload or a return trip
 * to "/" does not see it again. Skippable with a click or any key. Does not
 * render at all under prefers-reduced-motion, and does not consume the
 * "already seen" flag in that case either: an animation that never had a
 * chance to play has nothing to mark as seen.
 */
import { useEffect, useRef, useState } from 'react'
import { CarSilhouette } from './CarSilhouette'

const SEEN_KEY = 'pwiq_intro_seen'
const DURATION_MS = 1400

function alreadySeenThisSession(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1'
  } catch {
    // A private window or blocked storage: treat as "not seen" once, rather
    // than crash — the worst case is the animation can show more than once.
    return false
  }
}

function markSeen(): void {
  try {
    sessionStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* ignore — see alreadySeenThisSession */
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

// deciding: server render / not yet mounted — renders nothing, so there is no
//   hydration mismatch (the server has no sessionStorage or matchMedia to
//   decide with).
// ready:    mounted in its start state (small, opaque) for one paint, so the
//   browser has something to transition *from*.
// playing:  the end state (full scale, fading out) is applied — this is what
//   actually triggers the CSS transition.
// done:     unmounted; the page underneath was already there.
type Phase = 'deciding' | 'ready' | 'playing' | 'done'

export function IntroAnimation() {
  const [phase, setPhase] = useState<Phase>('deciding')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (prefersReducedMotion() || alreadySeenThisSession()) {
      setPhase('done')
      return
    }
    setPhase('ready')
  }, [])

  useEffect(() => {
    if (phase !== 'ready') return
    // One tick of the start state painted, then flip to the end state so the
    // CSS transition actually has something to animate from. A macrotask
    // (setTimeout) rather than requestAnimationFrame — a real browser already
    // paints before running a 0ms timeout, and rAF is unreliable under test
    // environments (jsdom has no real render loop to drive it).
    const id = setTimeout(() => setPhase('playing'), 0)
    return () => clearTimeout(id)
  }, [phase])

  useEffect(() => {
    if (phase !== 'playing') return
    timeoutRef.current = setTimeout(() => {
      markSeen()
      setPhase('done')
    }, DURATION_MS)
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [phase])

  function skip() {
    if (phase === 'done') return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    markSeen()
    setPhase('done')
  }

  if (phase === 'deciding' || phase === 'done') return null

  const playing = phase === 'playing'

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Skip intro"
      onClick={skip}
      onKeyDown={skip}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-bg-primary overflow-hidden cursor-pointer"
      style={{
        opacity: playing ? 0 : 1,
        transition: playing ? `opacity 220ms ease-in ${DURATION_MS - 220}ms` : 'none',
      }}
    >
      <div
        style={{
          width: 150,
          transform: playing ? 'scale(13)' : 'scale(1)',
          transformOrigin: 'center center',
          transition: playing ? `transform ${DURATION_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)` : 'none',
          willChange: 'transform',
        }}
      >
        <CarSilhouette className="w-full h-auto" />
      </div>
    </div>
  )
}
