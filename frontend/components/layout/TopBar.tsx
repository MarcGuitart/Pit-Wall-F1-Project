'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRaceStore } from '@/stores/raceStore'
import { useAccessStore } from '@/stores/accessStore'
import { RadioTrigger } from '@/components/radio/RadioTrigger'
import { seasonRangeLabel } from '@/lib/seasons'

type BreadcrumbItem = {
  label: string
  href?: string
}

type TopBarProps = {
  breadcrumb?: BreadcrumbItem[]
}

export function TopBar({ breadcrumb }: TopBarProps) {
  const { mode } = useRaceStore()
  // Both halves required: an active token AND the display preference (Settings'
  // toggle) still set to show it. A token past its expiry, or hidden by choice,
  // shows nothing here rather than a stale or unwanted badge.
  const showProBadge = useAccessStore((s) => s.pro && s.showBadge)
  const [showLiveTip, setShowLiveTip] = useState(false)

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

      {/* PRO indicator — only when active, never a permanent "Free" that adds
          noise. Clicks through to Settings, where the toggle and the code
          field actually live now. */}
      {showProBadge && (
        <Link
          href="/settings"
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-[3px] border border-signal-green/40
                     bg-signal-green/[0.07] hover:bg-signal-green/[0.14] transition-colors shrink-0"
          aria-label="PRO access active — open Settings"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse" aria-hidden="true" />
          <span className="font-display font-bold text-[9px] uppercase tracking-[1.5px] text-signal-green">
            PRO
          </span>
        </Link>
      )}

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
          {/* Historical — always active */}
          <div
            className={`px-3 py-1 rounded-[2px] font-display font-bold text-[10px] uppercase tracking-[1px] select-none ${
              mode === 'historical' ? 'bg-signal-red text-white' : 'text-text-secondary'
            }`}
          >
            Historical
          </div>

          {/* Live — coming soon */}
          <div className="relative">
            <button
              onMouseEnter={() => setShowLiveTip(true)}
              onMouseLeave={() => setShowLiveTip(false)}
              onFocus={() => setShowLiveTip(true)}
              onBlur={() => setShowLiveTip(false)}
              className="px-3 py-1 rounded-[2px] font-display font-bold text-[10px] uppercase tracking-[1px] text-text-muted/50 cursor-not-allowed flex items-center gap-1.5"
              aria-label="Live mode — coming soon"
            >
              Live
              <span className="px-1 py-0.5 rounded-[2px] bg-signal-amber/15 border border-signal-amber/30 text-signal-amber font-mono text-[7px] leading-none">
                SOON
              </span>
            </button>
            {showLiveTip && (
              <div className="absolute top-full right-0 mt-2 z-50 pointer-events-none">
                <div className="bg-bg-elevated border border-border-default rounded-[4px] px-3 py-2 shadow-xl w-[210px]">
                  <div className="font-display font-bold text-[10px] uppercase tracking-[1px] text-signal-amber mb-1">
                    Live mode · Coming soon
                  </div>
                  <div className="font-mono text-[9px] text-text-muted leading-relaxed">
                    Real-time is not available yet. The live mode will allow you to follow along with the race as it happens. At the moment, you can explore historical races from {seasonRangeLabel()}.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Docs */}
        <Link
          href="/docs"
          className="font-display font-bold text-[10px] uppercase tracking-[1px] text-text-secondary hover:text-text-primary transition-colors"
        >
          Docs
        </Link>

        {/* Radio trigger */}
        <RadioTrigger />
      </div>
    </header>
  )
}
