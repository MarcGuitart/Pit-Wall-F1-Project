export type RaceMeta = {
  meeting_key: number
  session_key: number
  meeting_name: string
  session_name: string
  circuit_short_name: string | null
  country_name: string | null
  year: number
}

export type RaceBrain = {
  race_phase: string
  main_question: string
  chaos_index: number
  best_compound: string | null
  strategic_tension: 'Low' | 'Medium' | 'High'
  summary: string
}

export type TruePaceRow = {
  driver_number: number
  driver_code: string
  team_name: string | null
  team_colour: string | null
  rank: number
  median_lap: number
  clean_pace: number
  traffic_score: number
  sample_size: number
  confidence: 'Low' | 'Medium' | 'High'
  exclusion_log: string[]
  verdict: string
}

export type TyreDegradationRow = {
  driver_number: number
  driver_code: string
  compound: 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET' | string
  stint_number: number
  lap_start: number
  lap_end: number
  tyre_age_start: number | null
  degradation_slope: number
  cliff_risk: 'Low' | 'Medium' | 'High'
  confidence: 'Low' | 'Medium' | 'High'
}

export type PitImpactRow = {
  driver_number: number
  driver_code: string
  lap_number: number
  lane_duration: number | null
  stop_duration: number | null
  position_before: number | null
  position_after: number | null
  net_position_change: number | null
  verdict: string
  confidence: 'Low' | 'Medium' | 'High'
}

export type ChaosIndex = {
  score: number
  level: 'Low' | 'Medium' | 'High' | 'Extreme'
  peak_chaos_lap: number | null
  components: {
    safety_car: number
    yellow_flags: number
    investigations: number
    penalties: number
    weather: number
    position_volatility: number
  }
  summary: string
}

export type EngineerNote = {
  lap_number: number | null
  type:
    | 'TYRE_DEGRADATION'
    | 'UNDERCUT'
    | 'PIT_IMPACT'
    | 'CHAOS'
    | 'TRAFFIC'
    | 'TRUE_PACE'
    | 'WEATHER'
    | 'ANOMALY'
  severity: 'Low' | 'Medium' | 'High'
  title: string
  message: string
}

export type RaceDecision = {
  rank: number
  lap_number: number | null
  title: string
  impact: string
  explanation: string
  confidence: 'Low' | 'Medium' | 'High'
}

export type FullRaceAnalysis = {
  race: RaceMeta
  race_brain: RaceBrain
  true_pace: TruePaceRow[]
  tyre_degradation: TyreDegradationRow[]
  pit_impact: PitImpactRow[]
  chaos: ChaosIndex
  engineer_notes: EngineerNote[]
  decisions: RaceDecision[]
}

export type RaceListItem = {
  meeting_key: number
  meeting_name: string
  country_name: string
  circuit_short_name: string
  date_start: string
  year: number
}

export type SessionInfo = {
  session_key: number
  session_name: string
  session_type: string
  date_start: string
}
