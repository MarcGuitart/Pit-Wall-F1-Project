import type { FullRaceAnalysis } from '@/types'

type FocusedDriver = { code: string; name: string } | null

export function generateSuggestedQuestions(
  analysis: FullRaceAnalysis,
  focusedDriver: FocusedDriver,
): string[] {
  const questions: string[] = []
  const chaos = analysis.chaos

  // ── Focused driver questions — highest priority ─────────────────────────
  if (focusedDriver) {
    const code = focusedDriver.code
    questions.push(`What was ${code}'s true pace compared to the leaders?`)
    const driverPit = analysis.pit_impact.find((p) => p.driver_code === code)
    if (driverPit) {
      const dir = (driverPit.net_position_change ?? 0) >= 0 ? 'gain' : 'cost'
      questions.push(`Why did ${code}'s pit stop ${dir} positions?`)
    }
    const driverTyre = analysis.tyre_degradation.find((t) => t.driver_code === code && t.cliff_risk === 'High')
    if (driverTyre) {
      questions.push(`When did ${code}'s ${driverTyre.compound} tyres hit the cliff?`)
    } else {
      questions.push(`How did ${code} manage their tyres across stints?`)
    }
    if (analysis.weather_analysis?.strategy_impact === 'High') {
      questions.push(`Did ${code} time the weather crossover well?`)
    }
    return questions.slice(0, 4)
  }

  // ── Weather questions — only when crossover data exists ─────────────────
  const crossovers = analysis.crossover_windows ?? []
  if (crossovers.length > 0) {
    const cw = crossovers[0]
    questions.push(`Who gained the most from the lap ${cw.lap_start}–${cw.lap_end} weather transition?`)
    if ((cw.best_timed_drivers ?? []).length > 0) {
      questions.push(`Why did ${cw.best_timed_drivers[0]} get the weather crossover right?`)
    }
    if ((cw.late_drivers ?? []).length > 0) {
      questions.push(`Why did ${cw.late_drivers[0]} lose out in the weather crossover?`)
    }
  }

  // ── DRS train questions — only when peak train data exists ───────────────
  const meaningfulTrains = analysis.drs_trains?.meaningful_trains ?? []
  if (meaningfulTrains.length > 0) {
    const peak = analysis.drs_trains?.peak_train ?? meaningfulTrains[0]
    if (peak?.trapped_drivers?.length) {
      questions.push(`Why was ${peak.trapped_drivers[0]} stuck in the ${peak.peak_length}-car DRS train?`)
    }
    if (peak?.leader) {
      questions.push(`How did ${peak.leader} hold the DRS train lead?`)
    }
  }

  // ── Pace-based questions — always answerable ────────────────────────────
  const paceSorted = [...analysis.true_pace].sort((a, b) => a.rank - b.rank)
  if (paceSorted.length >= 2) {
    const p1 = paceSorted[0]
    const p2 = paceSorted[1]
    const gap = Math.abs(p1.clean_pace - p2.clean_pace).toFixed(2)
    questions.push(`Why was ${p1.driver_code} ${gap}s faster on clean laps than ${p2.driver_code}?`)
  }

  // ── Chaos / SC questions — only when SC components are high ─────────────
  if (chaos.components.safety_car >= 15) {
    questions.push('Who gained the most from the safety car timing?')
    questions.push('Did the safety car decide the race result?')
  }

  // ── Key decisions — always answerable ───────────────────────────────────
  if (analysis.decisions.length > 0) {
    const top = analysis.decisions[0]
    questions.push(`Explain "${top.title}" — was it the right call?`)
  }

  // ── Tyre cliff — only when High cliff risk exists ────────────────────────
  const highCliff = analysis.tyre_degradation.find((t) => t.cliff_risk === 'High')
  if (highCliff) {
    questions.push(`How badly did ${highCliff.driver_code}'s ${highCliff.compound} tyres degrade?`)
  }

  // ── Pit impact — best winner vs worst loser ──────────────────────────────
  const bestPit = [...analysis.pit_impact].sort((a, b) => (b.net_position_change ?? 0) - (a.net_position_change ?? 0))[0]
  const worstPit = [...analysis.pit_impact].sort((a, b) => (a.net_position_change ?? 0) - (b.net_position_change ?? 0))[0]
  if (bestPit && (bestPit.net_position_change ?? 0) > 0) {
    questions.push(`How did ${bestPit.driver_code} gain ${bestPit.net_position_change} positions from their lap ${bestPit.lap_number} stop?`)
  }
  if (worstPit && (worstPit.net_position_change ?? 0) < -1) {
    questions.push(`Why did ${worstPit.driver_code} lose ${Math.abs(worstPit.net_position_change ?? 0)} positions at the pit stop?`)
  }

  // ── Generic fallbacks ────────────────────────────────────────────────────
  if (questions.length < 2) {
    questions.push('Who had the best race strategy overall?')
    questions.push('What was the biggest strategic mistake in this race?')
  }

  return questions.slice(0, 4)
}
