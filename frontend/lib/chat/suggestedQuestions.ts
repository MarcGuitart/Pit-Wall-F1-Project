import type { FullRaceAnalysis } from '@/types'

type FocusedDriver = { code: string; name: string } | null

export function generateSuggestedQuestions(
  analysis: FullRaceAnalysis,
  focusedDriver: FocusedDriver,
): string[] {
  const questions: string[] = []

  // Weather-based
  if (analysis.weather_analysis?.strategy_impact === 'High') {
    questions.push('Who gained most from the weather transition?')
    questions.push('When did the crossover window open?')
    if ((analysis.crossover_windows ?? []).length > 0) {
      questions.push('Did anyone stay out too long past the crossover?')
    }
  }

  // DRS-based
  const meaningfulTrains = analysis.drs_trains?.meaningful_trains ?? []
  if (meaningfulTrains.length > 0) {
    const peak = meaningfulTrains[0]
    if (peak.peak_length >= 8) {
      questions.push(`Who was trapped in the ${peak.peak_length}-car DRS train?`)
    }
    questions.push('Did clean air matter more than tyre delta in this race?')
    if (peak.leader) {
      questions.push(`How did ${peak.leader} end up leading the DRS train?`)
    }
  }

  // Chaos-based
  if (analysis.chaos.score >= 70) {
    questions.push('What was the turning point of the race?')
    questions.push('Who benefited most from the chaos?')
  }

  // SC-based
  if (analysis.chaos.components.safety_car >= 20) {
    questions.push('Who were the biggest SC winners?')
    questions.push('Did the SC timing decide the race?')
  }

  // Focused driver
  if (focusedDriver) {
    questions.push(`Explain ${focusedDriver.code}'s race strategy`)
    questions.push(`Was ${focusedDriver.code} stuck in traffic?`)
    if (analysis.weather_analysis?.strategy_impact === 'High') {
      questions.push(`Did ${focusedDriver.code} time the weather correctly?`)
    }
    const driverPit = analysis.pit_impact.find((p) => p.driver_code === focusedDriver.code)
    if (driverPit && Math.abs(driverPit.net_position_change ?? 0) >= 2) {
      const dir = (driverPit.net_position_change ?? 0) > 0 ? 'gain' : 'lose'
      questions.push(`Why did ${focusedDriver.code}'s pit stop ${dir} so much?`)
    }
  }

  // Default fallbacks — always present if nothing else generated enough
  if (questions.length < 2) {
    questions.push('Who had the best strategy in this race?')
    questions.push('What decisions changed the outcome?')
  }

  return questions.slice(0, 4)
}
