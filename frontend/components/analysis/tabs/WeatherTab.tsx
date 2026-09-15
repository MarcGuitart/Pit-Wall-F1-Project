'use client'

import type { FullRaceAnalysis } from '@/types'
import { WeatherOverlay } from '../strategy/WeatherOverlay'
import { ModuleUnavailable } from '../ModuleUnavailable'

type Props = {
  analysis: FullRaceAnalysis
  totalLaps: number
  sessionType: string
}

export function WeatherTab({ analysis, totalLaps, sessionType }: Props) {
  if (!analysis.weather_analysis) {
    return <ModuleUnavailable title="Weather Strategy Impact" analysis={analysis} field="weather_analysis" />
  }

  const crossoverStatus = analysis.modules?.crossover_windows?.status
  const winnersStatus = analysis.modules?.weather_winners_losers?.status

  return (
    <div className="space-y-3">
      <WeatherOverlay
        weather={analysis.weather_analysis}
        totalLaps={totalLaps}
        crossoverWindows={analysis.crossover_windows}
        weatherWinners={analysis.weather_winners_losers}
        sessionType={sessionType}
      />
      {/* WeatherOverlay only renders these when they have content; say why when they don't */}
      {analysis.crossover_windows.length === 0 && crossoverStatus && (
        <ModuleUnavailable title="Crossover Windows" analysis={analysis} field="crossover_windows" />
      )}
      {!analysis.weather_winners_losers && winnersStatus === 'failed' && (
        <ModuleUnavailable title="Weather Winners & Losers" analysis={analysis} field="weather_winners_losers" />
      )}
    </div>
  )
}
