'use client'

import { useState, useRef, useEffect, useCallback, useId } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export type PitWallSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

type PitWallSelectProps = {
  label?: string
  value: string
  options: PitWallSelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
  width?: string
  placeholder?: string
}

const SEARCH_THRESHOLD = 8

export function PitWallSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  width,
  placeholder = 'Select…',
}: PitWallSelectProps) {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState<number>(-1)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const id = useId()

  const showSearch = options.length > SEARCH_THRESHOLD

  const filteredOptions = showSearch && search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  const selected = options.find((o) => o.value === value)
  const displayLabel = selected?.label ?? placeholder

  const close = useCallback(() => {
    setOpen(false)
    setHighlighted(-1)
    setSearch('')
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, close])

  // Auto-focus search when dropdown opens
  useEffect(() => {
    if (open && showSearch) {
      setTimeout(() => searchRef.current?.focus(), 50)
    }
  }, [open, showSearch])

  // Reset highlighted when filtered list changes
  useEffect(() => {
    setHighlighted(-1)
  }, [search])

  // Keyboard handler for the trigger button
  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (!open) {
          setHighlighted(filteredOptions.findIndex((o) => o.value === value))
          setOpen(true)
        } else if (highlighted >= 0 && !filteredOptions[highlighted]?.disabled) {
          onChange(filteredOptions[highlighted].value)
          close()
        }
        break
      case 'ArrowDown':
        e.preventDefault()
        if (!open) {
          setOpen(true)
          setHighlighted(0)
        } else {
          setHighlighted((h) => {
            let next = h + 1
            while (next < filteredOptions.length && filteredOptions[next]?.disabled) next++
            return Math.min(next, filteredOptions.length - 1)
          })
        }
        break
      case 'ArrowUp':
        e.preventDefault()
        if (open) {
          setHighlighted((h) => {
            let prev = h - 1
            while (prev >= 0 && filteredOptions[prev]?.disabled) prev--
            return Math.max(prev, 0)
          })
        }
        break
      case 'Escape':
        e.preventDefault()
        close()
        break
    }
  }

  // Keyboard handler for search input
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlighted((h) => {
          let next = h + 1
          while (next < filteredOptions.length && filteredOptions[next]?.disabled) next++
          return Math.min(next, filteredOptions.length - 1)
        })
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlighted((h) => {
          let prev = h - 1
          while (prev >= 0 && filteredOptions[prev]?.disabled) prev--
          return Math.max(prev, 0)
        })
        break
      case 'Enter':
        e.preventDefault()
        if (highlighted >= 0 && filteredOptions[highlighted] && !filteredOptions[highlighted].disabled) {
          onChange(filteredOptions[highlighted].value)
          close()
        }
        break
      case 'Escape':
        e.preventDefault()
        close()
        break
    }
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-1"
      style={width ? { width } : undefined}
    >
      {label && (
        <label
          htmlFor={id}
          className="font-display font-bold text-[9px] uppercase tracking-[1.5px] text-text-muted select-none"
        >
          {label}
        </label>
      )}

      {/* Trigger button */}
      <div className="relative">
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
          onKeyDown={handleTriggerKeyDown}
          onClick={() => {
            if (disabled) return
            if (!open) setHighlighted(filteredOptions.findIndex((o) => o.value === value))
            setOpen((v) => !v)
          }}
          className={[
            'w-full flex items-center justify-between',
            'bg-bg-elevated border rounded-[3px]',
            'px-[10px] py-[6px] pr-7',
            'font-display font-semibold text-[11px] uppercase tracking-[0.5px]',
            'transition-all outline-none',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            open
              ? 'border-signal-blue shadow-[0_0_0_1px_rgba(77,163,255,.2)] text-text-primary'
              : 'border-border-default text-text-secondary hover:border-border-default/80 hover:text-text-primary',
          ].join(' ')}
        >
          <span className="truncate">{displayLabel}</span>
        </button>

        {/* Custom arrow */}
        <span
          className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none select-none text-[10px]"
          aria-hidden="true"
        >
          ▾
        </span>

        {/* Dropdown menu */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -4 }}
              transition={{ duration: 0.12 }}
              role="listbox"
              aria-label={label}
              className="absolute z-50 top-[calc(100%+3px)] left-0 w-full min-w-max bg-bg-panel border border-border-default rounded-[3px] shadow-xl overflow-hidden"
              style={{ maxHeight: '240px', display: 'flex', flexDirection: 'column' }}
            >
              {/* Search input — shown when options > SEARCH_THRESHOLD */}
              {showSearch && (
                <div className="shrink-0 border-b border-border-subtle">
                  <input
                    ref={searchRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Search…"
                    className="w-full bg-bg-primary px-[10px] py-[7px] font-body text-[11px] text-text-primary placeholder:text-text-muted outline-none border-none"
                  />
                </div>
              )}

              {/* Options list */}
              <div style={{ overflowY: 'auto' }}>
                {filteredOptions.length === 0 ? (
                  <div className="px-[10px] py-[7px] font-mono text-[10px] text-text-muted">
                    No results
                  </div>
                ) : (
                  filteredOptions.map((opt, i) => (
                    <div
                      key={opt.value + i}
                      role="option"
                      aria-selected={opt.value === value}
                      aria-disabled={opt.disabled}
                      onMouseEnter={() => !opt.disabled && setHighlighted(i)}
                      onClick={() => {
                        if (opt.disabled) return
                        onChange(opt.value)
                        close()
                      }}
                      className={[
                        'px-[10px] py-[7px]',
                        'font-display font-semibold text-[11px] uppercase tracking-[0.5px]',
                        'transition-colors',
                        opt.disabled
                          ? 'text-text-muted cursor-not-allowed opacity-50'
                          : 'cursor-pointer',
                        opt.value === value && !opt.disabled
                          ? 'text-text-primary bg-bg-elevated'
                          : '',
                        highlighted === i && !opt.disabled
                          ? 'bg-bg-elevated text-text-primary'
                          : 'text-text-secondary',
                      ].join(' ')}
                    >
                      {opt.label}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
