'use client'

import { useEffect } from 'react'

/**
 * The landing's reveal (Block 29, task 5): [data-reveal] blocks below the
 * fold fade in rising 8 px, 200 ms — opacity and transform only, so nothing
 * moves in the layout. Armed by the first scroll, so the page is complete and
 * visible without JavaScript and on first paint; only blocks still below the
 * fold at that moment are hidden, so nothing on screen ever disappears. Off
 * under prefers-reduced-motion.
 */
export function armReveal(root: ParentNode = document): () => void {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return () => {}
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {}
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      const el = e.target as HTMLElement
      el.style.opacity = '1'
      el.style.transform = 'none'
      io.unobserve(el)
    }
  }, { rootMargin: '0px 0px -6% 0px' })
  root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
    if (el.getBoundingClientRect().top <= window.innerHeight * 0.94) return
    el.style.opacity = '0'
    el.style.transform = 'translateY(8px)'
    el.style.transition = 'opacity 200ms cubic-bezier(0.2, 0, 0, 1), transform 200ms cubic-bezier(0.2, 0, 0, 1)'
    io.observe(el)
  })
  return () => io.disconnect()
}

export function Reveal() {
  useEffect(() => {
    let stop = () => {}
    const onScroll = () => { stop = armReveal() }
    window.addEventListener('scroll', onScroll, { passive: true, once: true })
    return () => { window.removeEventListener('scroll', onScroll); stop() }
  }, [])
  return null
}
