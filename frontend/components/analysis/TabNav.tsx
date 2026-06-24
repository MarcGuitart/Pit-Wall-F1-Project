'use client'

import type { FullRaceAnalysis } from '@/types'
import type { ActiveTab } from '@/stores/raceStore'
import type { SessionType } from '@/lib/utils'

// SVG icons for tabs that need proper vector rendering (no emoji)
function IconWeather({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {/* Rain cloud */}
      <path
        d="M4.5 10.5a3 3 0 1 1 5.83-1H11a2.5 2.5 0 0 1 0 5H4a2.5 2.5 0 0 1-.5-4.95"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <line x1="5.5" y1="14" x2="5" y2="16" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="8" y1="14" x2="7.5" y2="16" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="10.5" y1="14" x2="10" y2="16" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

function IconRaceControl({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {/* Chequered flag */}
      <line x1="3" y1="1" x2="3" y2="15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <rect x="3" y="1" width="4" height="3" fill="currentColor"/>
      <rect x="7" y="1" width="4" height="3" fill="none" stroke="currentColor" strokeWidth="0.5"/>
      <rect x="3" y="4" width="4" height="3" fill="none" stroke="currentColor" strokeWidth="0.5"/>
      <rect x="7" y="4" width="4" height="3" fill="currentColor"/>
    </svg>
  )
}

type Tab = {
  id: ActiveTab
  label: string
  icon: string | null
  svgIcon?: React.FC<{ size?: number }>
  sessionTypes: SessionType[]
  getBadge?: (analysis: FullRaceAnalysis) => string | number | undefined
}

const TABS: Tab[] = [
  {
    id: 'strategy',
    label: 'Strategy',
    icon: '⬡',
    sessionTypes: ['Race', 'Qualifying', 'Practice'],
  },
  {
    id: 'management',
    label: 'Tyre & Pit',
    icon: '◎',
    sessionTypes: ['Race'],
    getBadge: (a) => a.pit_impact.length || undefined,
  },
  {
    id: 'weather',
    label: 'Weather',
    icon: null,
    svgIcon: IconWeather,
    sessionTypes: ['Race', 'Qualifying', 'Practice'],
    getBadge: (a) => a.weather_analysis?.events.length || undefined,
  },
  {
    id: 'telemetry',
    label: 'Telemetry',
    icon: '◈',
    sessionTypes: ['Race', 'Qualifying', 'Practice'],
  },
  {
    id: 'control',
    label: 'Race Control',
    icon: null,
    svgIcon: IconRaceControl,
    sessionTypes: ['Race', 'Qualifying', 'Practice'],
    getBadge: (a) => a.engineer_notes.length || undefined,
  },
]

type Props = {
  activeTab: ActiveTab
  onTabChange: (tab: ActiveTab) => void
  sessionType: SessionType
  analysis: FullRaceAnalysis
}

export function TabNav({ activeTab, onTabChange, sessionType, analysis }: Props) {
  const visibleTabs = TABS.filter((t) => t.sessionTypes.includes(sessionType))

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="flex items-stretch h-[42px] border-b border-border-subtle">
        {visibleTabs.map((tab) => {
          const isActive = tab.id === activeTab
          const badge = tab.getBadge?.(analysis)
          const SvgIcon = tab.svgIcon
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={[
                'relative flex items-center gap-1.5 px-4 h-full transition-colors select-none',
                'font-display font-bold text-[11px] uppercase tracking-[1px]',
                isActive
                  ? 'text-text-primary'
                  : 'text-text-muted hover:text-text-secondary',
              ].join(' ')}
            >
              {SvgIcon ? (
                <SvgIcon size={13} />
              ) : (
                <span className="text-[13px] leading-none">{tab.icon}</span>
              )}
              <span>{tab.label}</span>
              {badge != null && (
                <span
                  className={[
                    'px-1.5 py-0.5 rounded-[3px] border font-mono text-[9px] leading-none',
                    isActive
                      ? 'bg-signal-red/10 border-signal-red/25 text-signal-red'
                      : 'bg-bg-elevated border-border-subtle text-text-muted',
                  ].join(' ')}
                >
                  {badge}
                </span>
              )}
              {/* Active indicator line */}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-signal-red" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
