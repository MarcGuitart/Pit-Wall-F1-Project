'use client'

import type { ButtonHTMLAttributes, KeyboardEvent, ReactNode } from 'react'
import s from './ui.module.css'

type Variant = 'default' | 'primary' | 'ink' | 'ghost'
const VARIANT: Record<Variant, string> = { default: '', primary: s.btnPrimary, ink: s.btnInk, ghost: s.btnGhost }

export function buttonClass(variant: Variant = 'default', large = false) {
  return `${s.btn} ${VARIANT[variant]} ${large ? s.btnLarge : ''}`
}

export function Button({ variant = 'default', large, className = '', type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; large?: boolean }) {
  return <button type={type} className={`${buttonClass(variant, large)} ${className}`} {...rest} />
}

/**
 * Live's segmented control. Arrow keys move between options (roving
 * tabindex), as a set of mutually exclusive buttons should.
 */
export function Segmented<T extends string>({ value, options, onChange, label, small, role = 'radiogroup' }: {
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (v: T) => void
  label: string
  small?: boolean
  role?: 'radiogroup' | 'tablist'
}) {
  const idx = options.findIndex((o) => o.value === value)
  const key = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const n = (idx + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length
    onChange(options[n].value)
    const el = (e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button')[n]
    el?.focus()
  }
  const itemRole = role === 'tablist' ? 'tab' : 'radio'
  return (
    <div className={`${s.seg} ${small ? s.segSmall : ''}`} role={role} aria-label={label} onKeyDown={key}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role={itemRole}
            aria-checked={itemRole === 'radio' ? on : undefined}
            aria-selected={itemRole === 'tab' ? on : undefined}
            tabIndex={on ? 0 : -1}
            title={o.title}
            className={`${s.segOpt} ${on ? s.segOn : ''}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Live's tab bar: scrolls sideways, red underline on the current tab; sticky on request. */
export function Tabs<T extends string>({ value, tabs, onChange, label, sticky = false }: {
  value: T
  tabs: { id: T; label: ReactNode; count?: number | string; icon?: ReactNode }[]
  onChange: (v: T) => void
  label: string
  /** Sticks to the top of the viewport — only where no sticky bar sits above it. */
  sticky?: boolean
}) {
  return (
    <nav className={`${s.tabs} ${sticky ? s.tabsSticky : ''}`} aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`${s.tab} ${t.id === value ? s.tabOn : ''}`}
          aria-current={t.id === value ? 'page' : undefined}
          onClick={() => onChange(t.id)}
        >
          {t.icon}
          {t.label}
          {t.count != null && <span className={s.tabCount}>{t.count}</span>}
        </button>
      ))}
    </nav>
  )
}
