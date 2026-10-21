'use client'

import Link from 'next/link'
import type { ComponentProps, MouseEvent } from 'react'
import { useNavigateWithSweep } from '@/lib/raceNav'
import { prefersReducedMotion, shouldSweep } from '@/lib/sweep'
import { usePathname } from 'next/navigation'

/**
 * A Link to a race or live mode that sweeps on a plain click (block 34). A
 * modified or middle click, or reduced motion, falls through to the Link.
 */
export function SweepLink({ href, label, onClick, ...rest }: Omit<ComponentProps<typeof Link>, 'href'> & { href: string; label: string }) {
  const navigate = useNavigateWithSweep()
  const pathname = usePathname()
  return (
    <Link
      href={href}
      {...rest}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e)
        if (!shouldSweep(href, pathname ?? '', e, prefersReducedMotion())) return
        e.preventDefault()
        navigate(href, label, { button: 0, timeStamp: e.timeStamp })
      }}
    />
  )
}
