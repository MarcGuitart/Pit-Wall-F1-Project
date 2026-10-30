import localFont from 'next/font/local'

/**
 * The site's faces, served from the repo (app/fonts, SIL Open Font License,
 * from Fontsource's latin subsets) instead of fetched from Google Fonts at
 * build time: a build no longer depends on the network (block 52b, where
 * next/font/google failed a build in two or three).
 *
 * Archivo is the face every page renders. JetBrains Mono is kept for code and
 * tabular contexts. Barlow and Barlow Condensed are gone: measured on 30 Oct,
 * no visible text on /, /races, a race, /settings, /docs, /live or the Recon
 * Lap rendered in them, yet all their files were preloaded. Their CSS
 * variables now point at Archivo (app/layout.tsx), so a leftover class still
 * gets the site's face.
 */
export const archivo = localFont({
  src: [
    { path: '../app/fonts/archivo-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../app/fonts/archivo-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: '../app/fonts/archivo-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: '../app/fonts/archivo-latin-800-normal.woff2', weight: '800', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-archivo',
  fallback: ['system-ui', 'sans-serif'],
})

export const jetbrainsMono = localFont({
  src: [
    { path: '../app/fonts/jetbrains-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../app/fonts/jetbrains-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-jetbrains-mono',
  // Only where code is shown; no reason to preload it on every page.
  preload: false,
  fallback: ['ui-monospace', 'monospace'],
})
