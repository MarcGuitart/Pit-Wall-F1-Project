import type { ReactNode } from 'react'
import { archivo } from '@/lib/fonts'
import s from './ui.module.css'

/**
 * The design system's root: tokens, ground colour, Archivo with tabular
 * numerals. Everything that uses the primitives sits inside one. The app is
 * dark; `theme` exists because the tokens already carry the light ground the
 * live page offers.
 */
export function PwRoot({ children, theme = 'dark', className = '' }: { children: ReactNode; theme?: 'dark' | 'light'; className?: string }) {
  return (
    <div className={`${s.root} ${archivo.className} ${archivo.variable} ${className}`} data-theme={theme}>
      {children}
    </div>
  )
}
