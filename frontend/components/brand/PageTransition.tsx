'use client'

/**
 * A quick car-crossing-the-screen flourish on navigation to any page that is
 * not /race/[key] or /live/[key].
 *
 * Deliberately not a route-change *gate*: it never delays the navigation or
 * blocks interaction (pointer-events: none throughout, and the destination
 * page has already rendered underneath by the time this plays — Next.js's
 * client-side navigation has already swapped the page; this overlay is purely
 * decorative on top of it, which is also why it cannot affect the
 * destination's own LCP). Excluded from /race and /live on purpose: those
 * pages carry a real data-loading screen of their own, and a second animation
 * stacked in front of a loading state reads as slower, not nicer.
 *
 * Mounted once, in the root layout, the same way AccessBootstrap is — so it
 * persists across client-side navigation instead of remounting per page.
 */
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { CarSilhouette } from './CarSilhouette'

const DURATION_MS = 500
const RACE_OR_LIVE = /^\/(race|live)\//

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function PageTransition() {
  const pathname = usePathname()
  const prevPathname = useRef<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const prev = prevPathname.current
    prevPathname.current = pathname

    if (prev === null) return                       // first mount: no transition
    if (prev === pathname) return                    // same route (e.g. a hash jump)
    if (RACE_OR_LIVE.test(pathname ?? '')) return     // never into /race or /live
    if (prefersReducedMotion()) return

    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setPlaying(false)
    // Restart the CSS animation even if one was already mid-flight from a
    // rapid second navigation — a tick (setTimeout 0, not requestAnimationFrame;
    // see IntroAnimation for why) forces a style flush between removing and
    // re-adding the animated element.
    setTimeout(() => setPlaying(true), 0)
    timeoutRef.current = setTimeout(() => setPlaying(false), DURATION_MS)
  }, [pathname])

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  if (!playing) return null

  return (
    <div
      className="fixed inset-0 z-[100] pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      <div
        className="absolute top-1/2 left-1/2 -mt-[50px] -ml-[60px]"
        style={{
          width: 120,
          animation: `pwCarCross ${DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1) forwards`,
          willChange: 'transform, opacity',
        }}
      >
        <CarSilhouette className="w-full h-auto" />
      </div>
    </div>
  )
}
