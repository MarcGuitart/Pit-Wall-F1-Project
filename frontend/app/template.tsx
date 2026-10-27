'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import s from '@/components/layout/shell.module.css'

// False until the first page of this document has mounted.
let navigated = false

/**
 * The page-enter transition. A template (unlike a layout) is remounted on
 * every navigation, so the CSS animation on the page's <main> replays each
 * time: a 180 ms fade with an 8 px rise, entry only — no exit animation, no
 * delay, the content is in the DOM from the first frame. Only opacity and
 * transform. Reduced motion turns it off entirely (shell.module.css).
 *
 * Not on the document's first page: there is nothing to transition from,
 * and starting the page at opacity 0 pushed the landing's LCP from ~230 to
 * ~460 ms (an element is not "painted" for LCP while it is transparent).
 * Not on /live: a running session must never fade in or shift.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  const animate = navigated
  useEffect(() => { navigated = true }, [])
  if (!animate || pathname.startsWith('/live')) return <>{children}</>
  return <div className={s.enter}>{children}</div>
}

/** Test hook: forget that a page has been shown. */
export function __resetTemplateForTests() { navigated = false }
