'use client'

import Link from 'next/link'
import { useRaceStore } from '@/stores/raceStore'
import { RadioTrigger } from '@/components/radio/RadioTrigger'

type BreadcrumbItem = {
  label: string
  href?: string
}

type TopBarProps = {
  breadcrumb?: BreadcrumbItem[]
}

export function TopBar({ breadcrumb }: TopBarProps) {
  const { mode, setMode } = useRaceStore()

  return (
    <header className="h-12 bg-bg-secondary border-b border-border-subtle flex items-center px-4 gap-4 shrink-0 z-50 relative">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-0 shrink-0">
        <span className="font-display font-black text-[18px] uppercase tracking-[1px] text-text-primary">
          PIT WALL&nbsp;
        </span>
        <span className="font-display font-black text-[18px] uppercase tracking-[1px] text-signal-red">
          ENGINEER
        </span>
      </Link>

      {/* Breadcrumb */}
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="flex items-center gap-1.5 ml-4 overflow-hidden">
          {breadcrumb.map((item, i) => (
            <span key={i} className="flex items-center gap-1.5 min-w-0">
              {i > 0 && (
                <span className="text-text-muted text-[11px] shrink-0">›</span>
              )}
              {item.href ? (
                <Link
                  href={item.href}
                  className="font-mono text-[11px] text-text-secondary hover:text-text-primary transition-colors truncate"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="font-mono text-[11px] text-text-primary truncate">
                  {item.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* Right side */}
      <div className="ml-auto flex items-center gap-3">
        {/* Mode toggle */}
        <div className="flex items-center bg-bg-panel border border-border-subtle rounded-[3px] p-0.5 gap-0.5">
          <button
            onClick={() => setMode('historical')}
            className={`px-3 py-1 rounded-[2px] font-display font-bold text-[10px] uppercase tracking-[1px] transition-all ${
              mode === 'historical'
                ? 'bg-signal-red text-white'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Historical
          </button>
          <button
            onClick={() => setMode('live')}
            className={`px-3 py-1 rounded-[2px] font-display font-bold text-[10px] uppercase tracking-[1px] transition-all ${
              mode === 'live'
                ? 'bg-signal-red text-white'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Live
          </button>
        </div>

        {/* Radio trigger */}
        <RadioTrigger />
      </div>
    </header>
  )
}
