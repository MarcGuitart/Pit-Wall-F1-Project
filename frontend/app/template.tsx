'use client'

import { usePathname } from 'next/navigation'
import s from '@/components/layout/shell.module.css'

/**
 * The page-enter transition. A template (unlike a layout) is remounted on
 * every navigation, so the CSS animation on the page's <main> replays each
 * time: a 180 ms fade with an 8 px rise, entry only — no exit animation, no
 * delay, the content is in the DOM from the first frame. Only opacity and
 * transform. Reduced motion turns it off entirely (shell.module.css).
 *
 * Not on /live: a running session must never fade in or shift.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  if (pathname.startsWith('/live')) return <>{children}</>
  return <div className={s.enter}>{children}</div>
}
