'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * True once the element has come within `margin` of the viewport, and stays
 * true. Without IntersectionObserver (old browsers, tests) it is true at once.
 */
export function useInView<T extends Element>(margin = '200px'): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (seen) return
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return }
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect() }
    }, { rootMargin: margin })
    io.observe(el)
    return () => io.disconnect()
  }, [seen, margin])
  return [ref, seen]
}
