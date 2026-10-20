'use client'

import type { ButtonHTMLAttributes, KeyboardEvent, ReactNode } from 'react'
import s from './ui.module.css'
import { buttonClass, type ButtonVariant } from './buttonClass'

export { buttonClass }

type Variant = ButtonVariant

export function Button({ variant = 'default', large, className = '', type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; large?: boolean }) {
  return <button type={type} className={`${buttonClass(variant, large)} ${className}`} {...rest} />
}

/**
 * Live's segmented control. Arrow keys move between options (roving
 * tabindex), as a set of mutually exclusive buttons should.
 */
export function Segmented<T extends string>({ value, options, onChange, label, small, role = 'radiogroup', showLabel = false, markCurrent = false }: {
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (v: T) => void
  label: string
  small?: boolean
  role?: 'radiogroup' | 'tablist'
  /** Print the label beside the control (block 43: "Season"). */
  showLabel?: boolean
  /** Mark the active option by text too ("✓"), and with aria-current, not by colour alone. */
  markCurrent?: boolean
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
  const group = (
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
            aria-current={markCurrent && on ? 'true' : undefined}
            className={`${s.segOpt} ${on ? s.segOn : ''}`}
            onClick={() => onChange(o.value)}
          >
            {markCurrent && on && <span aria-hidden="true">✓ </span>}
            {o.label}
          </button>
        )
      })}
    </div>
  )
  if (!showLabel) return group
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className={s.label} aria-hidden="true">{label}</span>
      {group}
    </span>
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
