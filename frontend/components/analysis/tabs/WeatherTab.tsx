'use client'

import type { FullRaceAnalysis } from '@/types'
import { WeatherOverlay } from '../strategy/WeatherOverlay'
import { WeatherOverlay as WeatherStub } from '../stubs/WeatherOverlay'

type Props = {
  analysis: FullRaceAnalysis
  totalLaps: number
  sessionType: string
}

export function WeatherTab({ analysis, totalLaps, sessionType }: Props) {
  if (!analysis.weather_analysis) {
    return <WeatherStub />
  }

  return (
    <WeatherOverlay
      weather={analysis.weather_analysis}
      totalLaps={totalLaps}
      crossoverWindows={analysis.crossover_windows}
      weatherWinners={analysis.weather_winners_losers}
      sessionType={sessionType}
    />
  )
}
