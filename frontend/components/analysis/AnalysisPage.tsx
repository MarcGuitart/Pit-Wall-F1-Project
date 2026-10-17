'use client'

import { useState } from 'react'
import type { FullRaceAnalysis } from '@/types'
import { useRaceStore } from '@/stores/raceStore'
import { getSessionType } from '@/lib/utils'
import { chaosLevel, CHAOS_LEVEL_TONE } from '@/lib/chaos'
import { Badge, PageHeader, toneClass, ui } from '@/components/ui'
import a from './analysis.module.css'

import { TabNav } from './TabNav'
import { RacePhaseTimeline } from './RacePhaseTimeline'
import { ModuleUnavailable } from './ModuleUnavailable'
import { SessionTimelineBar } from './SessionTimelineBar'
import { TeamRadioLane } from './teamradio/TeamRadioLane'
import { DriverFocusStrip } from './DriverFocusStrip'
import { DriverCard } from './DriverCard'
import { RadioOverlay } from '@/components/radio/RadioOverlay'

import { StrategyTab } from './tabs/StrategyTab'
import { ManagementTab } from './tabs/ManagementTab'
import { WeatherTab } from './tabs/WeatherTab'
import { TelemetryTab } from './tabs/TelemetryTab'
import { RaceControlTab } from './tabs/RaceControlTab'
import { LapChartsTab } from './tabs/LapChartsTab'

type Props = {
  analysis: FullRaceAnalysis
  /** The /preview redesign draws its own race header above this page. */
  hideHeader?: boolean
}

function inferTotalLaps(analysis: FullRaceAnalysis): number {
  if (analysis.tyre_degradation.length)
    return Math.max(...analysis.tyre_degradation.map((s) => s.lap_end))
  if (analysis.pit_impact.length)
    return Math.max(...analysis.pit_impact.map((p) => p.lap_number)) + 10
  return 70
}

export function AnalysisPage({ analysis, hideHeader = false }: Props) {
  const {
    radioOpen, setRadioOpen,
    analysisMode, setAnalysisMode,
    focusedDriver, setFocusedDriver, clearFocusedDriver,
    activeTab, setActiveTab,
  } = useRaceStore()

  const [driverCardOpen, setDriverCardOpen] = useState(false)

  const totalLaps = inferTotalLaps(analysis)
  const sessionType = getSessionType(analysis.race.session_name)

  const focusedDriverRow = focusedDriver
    ? analysis.true_pace.find((d) => d.driver_code === focusedDriver.code)
    : null

  const visibleNotes = focusedDriver
    ? analysis.engineer_notes.filter(
        (n) => n.title.includes(focusedDriver.code) || n.message.includes(focusedDriver.code),
      )
    : analysis.engineer_notes

  const handleDriverFocus = (code: string, name: string) => {
    setFocusedDriver(code, name)
    setDriverCardOpen(true)
  }

  const handleCloseDriverCard = () => {
    clearFocusedDriver()
    setDriverCardOpen(false)
  }

  const handleAskEngineerAboutDriver = () => {
    setDriverCardOpen(false)
    setRadioOpen(true)
  }

  const level = analysis.chaos.level
  const levelTone = CHAOS_LEVEL_TONE[level as keyof typeof CHAOS_LEVEL_TONE] ?? CHAOS_LEVEL_TONE[chaosLevel(analysis.chaos.score)]

  return (
    <div className={a.page}>
      {/* Race header */}
      {!hideHeader && (
        <PageHeader
          kicker={<>Race analysis · OpenF1 · Session {analysis.race.session_key}</>}
          title={analysis.race.meeting_name}
          meta={<span>{analysis.race.circuit_short_name} · {analysis.race.year} · {analysis.race.session_name}</span>}
          right={
            <>
              <div className={a.headStats}>
                <div><div className={`${ui.mid} ${toneClass('accent')}`}>{analysis.chaos.score}</div><div className={ui.label}>Chaos</div></div>
                <div><div className={ui.mid}>{analysis.true_pace.length}</div><div className={ui.label}>Drivers</div></div>
                <div><div className={ui.mid}>{analysis.tyre_degradation.length}</div><div className={ui.label}>Stints</div></div>
              </div>
              <Badge tone={levelTone} solid={level === 'Extreme'}>{analysis.chaos.level} Chaos</Badge>
            </>
          }
        />
      )}

      <div className={a.stack} style={{ borderTop: hideHeader ? undefined : '2px solid var(--pw-divider)' }}>
      {/* Phase timeline — always visible above tabs */}
      {sessionType === 'Race' && analysis.modules?.race_phases?.status === 'failed' && (
        <ModuleUnavailable title="Race Phase Timeline" analysis={analysis} field="race_phases" />
      )}
      {sessionType === 'Race' && (analysis.race_phases ?? []).length > 0
        ? (
          <RacePhaseTimeline
            phases={analysis.race_phases}
            totalLaps={totalLaps}
          />
        ) : (
          <SessionTimelineBar
            totalLaps={totalLaps}
            sessionType={sessionType}
            engineerNotes={analysis.engineer_notes}
            pitEvents={analysis.pit_impact}
            chaosIndex={analysis.chaos}
          />
        )
      }

      {/* Team radio lane — only when the session has clips; no lane, no gap otherwise */}
      {sessionType === 'Race' && analysis.team_radio && analysis.team_radio.clips.length > 0 && (
        <TeamRadioLane radio={analysis.team_radio} totalLaps={totalLaps} />
      )}
      </div>

      {/* Tab navigation */}
      <TabNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        sessionType={sessionType}
        analysis={analysis}
      />

      {/* Driver focus strip — always visible when a driver is focused */}
      <DriverFocusStrip
        driverCode={focusedDriver?.code ?? null}
        driverName={focusedDriver?.name ?? null}
        onClear={handleCloseDriverCard}
      />

      {/* Tab content — switches instantly, like the live page's tabs */}
      <div key={activeTab} role="tabpanel" aria-label={activeTab}>
          {activeTab === 'strategy' && (
            <StrategyTab
              analysis={analysis}
              sessionType={sessionType}
              analysisMode={analysisMode}
              focusedDriver={focusedDriver?.code ?? null}
              visibleNotes={visibleNotes}
              onAnalysisModeChange={setAnalysisMode}
              onDriverClick={handleDriverFocus}
            />
          )}
          {activeTab === 'management' && (
            <ManagementTab
              analysis={analysis}
              sessionType={sessionType}
              focusedDriver={focusedDriver?.code ?? null}
              onDriverClick={handleDriverFocus}
              onSwitchToData={() => setAnalysisMode('data')}
            />
          )}
          {activeTab === 'laps' && (
            <LapChartsTab sessionKey={analysis.race.session_key} />
          )}
          {activeTab === 'weather' && (
            <WeatherTab
              analysis={analysis}
              totalLaps={totalLaps}
              sessionType={sessionType}
            />
          )}
          {activeTab === 'telemetry' && (
            <TelemetryTab
              sessionKey={analysis.race.session_key}
              analysis={analysis}
            />
          )}
          {activeTab === 'control' && (
            <RaceControlTab
              analysis={analysis}
              sessionType={sessionType}
              focusedDriver={focusedDriver?.code ?? null}
              visibleNotes={visibleNotes}
              onDriverClick={handleDriverFocus}
            />
          )}
      </div>

      {/* Driver card modal */}
      {focusedDriverRow && driverCardOpen && (
        <DriverCard
          driver={focusedDriverRow}
          stints={analysis.tyre_degradation.filter((s) => s.driver_number === focusedDriverRow.driver_number)}
          pits={analysis.pit_impact.filter((p) => p.driver_number === focusedDriverRow.driver_number)}
          radios={(analysis.team_radio?.clips ?? []).filter((c) => c.driver_number === focusedDriverRow.driver_number)}
          raceName={analysis.race.meeting_name}
          onClose={handleCloseDriverCard}
          onAskEngineer={handleAskEngineerAboutDriver}
        />
      )}

      {radioOpen && <RadioOverlay analysis={analysis} onClose={() => setRadioOpen(false)} />}
    </div>
  )
}
