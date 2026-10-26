'use client'

import type { FullRaceAnalysis } from '@/types'
import type { ActiveTab } from '@/stores/raceStore'
import type { SessionType } from '@/lib/utils'
import { Tabs } from '@/components/ui'
import a from './analysis.module.css'

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
    id: 'laps',
    label: 'Lap charts',
    icon: '∿',
    sessionTypes: ['Race'],
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
    <Tabs
      label="Analysis views"
      value={activeTab}
      onChange={onTabChange}
      tabs={visibleTabs.map((tab) => {
        const SvgIcon = tab.svgIcon
        return {
          id: tab.id,
          label: tab.label,
          count: tab.getBadge?.(analysis),
          icon: (
            <span className={a.tabIcon} aria-hidden="true">
              {SvgIcon ? <SvgIcon size={13} /> : tab.icon}
            </span>
          ),
        }
      })}
    />
  )
}
