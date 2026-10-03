'use client'

import { useEffect, useState } from 'react'

/**
 * Light or dark ground for the Modernist pages (live dashboard, redesign
 * preview). A per-browser preference, so localStorage is the right home;
 * every page using it hears a change made on another.
 */
export type PwTheme = 'dark' | 'light'
const KEY = 'pw_theme'
const EVENT = 'pw-theme-change'

function read(): PwTheme {
  try {
    return window.localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function usePwTheme(): [PwTheme, (t: PwTheme) => void] {
  const [theme, setTheme] = useState<PwTheme>('dark')
  useEffect(() => {
    setTheme(read())
    const sync = () => setTheme(read())
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  const set = (t: PwTheme) => {
    try { window.localStorage.setItem(KEY, t) } catch { /* this page only */ }
    setTheme(t)
    window.dispatchEvent(new Event(EVENT))
  }
  return [theme, set]
}
