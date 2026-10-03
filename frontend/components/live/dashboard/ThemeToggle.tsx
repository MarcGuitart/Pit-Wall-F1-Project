'use client'

import s from './live.module.css'
import type { PwTheme } from '@/lib/pwTheme'

export function ThemeToggle({ theme, onChange }: { theme: PwTheme; onChange: (t: PwTheme) => void }) {
  return (
    <button type="button" className={s.themeToggle} onClick={() => onChange(theme === 'dark' ? 'light' : 'dark')}
      aria-label={`Switch to the ${theme === 'dark' ? 'light' : 'dark'} ground`}>
      <span data-on={theme === 'light'}><i>Light</i></span>
      <span data-on={theme === 'dark'}><i>Dark</i></span>
    </button>
  )
}
