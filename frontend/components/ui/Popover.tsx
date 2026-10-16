'use client'

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import s from './ui.module.css'

/**
 * A click/tap popover — never hover. Hover-only popovers cannot be reached on
 * a phone, and one that closes when the pointer leaves the trigger makes its
 * own buttons unreachable (the old "next session" tip did both).
 *
 *   - opens on click, tap, Enter or Space (it is a <button>);
 *   - closes on Escape (focus returns to the trigger), on a click or tap
 *     outside, and on the trigger again;
 *   - aria-expanded / aria-controls on the trigger, role="dialog" with an
 *     accessible name on the panel; focus moves into the panel on open.
 */
export function Popover({ trigger, triggerLabel, title, children, align = 'right', triggerClassName = '', open: controlled, onOpenChange }: {
  /** Visible content of the trigger button. */
  trigger: ReactNode
  /** Accessible name of the trigger when its content is not enough. */
  triggerLabel?: string
  /** Heading of the panel; also its accessible name. */
  title: ReactNode
  children: ReactNode
  align?: 'left' | 'right'
  triggerClassName?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [own, setOwn] = useState(false)
  const open = controlled ?? own
  const setOpen = useCallback((v: boolean) => { if (controlled === undefined) setOwn(v); onOpenChange?.(v) }, [controlled, onOpenChange])
  const wrap = useRef<HTMLSpanElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()
  const panelId = `${id}-pop`
  const titleId = `${id}-title`

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); btn.current?.focus() }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    panel.current?.focus()
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, setOpen])

  return (
    <span ref={wrap} className={s.popWrap}>
      <button
        ref={btn}
        type="button"
        className={triggerClassName}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        aria-label={triggerLabel}
        onClick={() => setOpen(!open)}
      >
        {trigger}
      </button>
      {open && (
        <div ref={panel} id={panelId} role="dialog" aria-labelledby={titleId} tabIndex={-1} className={`${s.pop} ${align === 'left' ? s.popLeft : ''}`}>
          <div id={titleId} className={s.label} style={{ color: 'var(--pw-text)', fontWeight: 800, marginBottom: 6 }}>{title}</div>
          {children}
        </div>
      )}
    </span>
  )
}
