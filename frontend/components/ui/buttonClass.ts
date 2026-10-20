import s from './ui.module.css'

/**
 * The button classes, as a plain function: server components (Docs, the
 * landing, the 404) call it too, so it cannot live in a 'use client' module.
 */
export type ButtonVariant = 'default' | 'primary' | 'ink' | 'ghost'
const VARIANT: Record<ButtonVariant, string> = { default: '', primary: s.btnPrimary, ink: s.btnInk, ghost: s.btnGhost }

export function buttonClass(variant: ButtonVariant = 'default', large = false) {
  return `${s.btn} ${VARIANT[variant]} ${large ? s.btnLarge : ''}`
}
