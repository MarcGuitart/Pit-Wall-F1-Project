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

export type WeatherEvent = {
  lap_number: number | null
  event_type: 'RAIN_ONSET' | 'RAIN_END' | 'TEMP_SPIKE' | 'TEMP_DROP' | 'PEAK_RAIN'
  track_temp: number
  air_temp: number
  rainfall: number
  message: string
}

export type WeatherLap = {
  lap_number: number
  track_temp: number
  air_temp: number
  rainfall: number
  condition: 'DRY' | 'DAMP' | 'WET'
}

export type WeatherAnalysis = {
  dry_laps: number
  damp_laps: number
  wet_laps: number
  avg_track_temp: number
  min_track_temp: number
  max_track_temp: number
  peak_rainfall_lap: number | null
  events: WeatherEvent[]
  lap_conditions: WeatherLap[]
  strategy_impact: 'None' | 'Low' | 'Medium' | 'High'
  summary: string
}

// ── V4: Race Phase Timeline ───────────────────────────────────────────────────

export type RacePhase = {
  lap_start: number
  lap_end: number
  phase: string
  impact: 'Low' | 'Medium' | 'High'
  reason: string
  color_token: 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'muted'
}

// ── V4: Race DNA ──────────────────────────────────────────────────────────────

export type RaceDNA = {
  primary_factor: string
  secondary_factor: string
  strategy_type: string
  overtaking_difficulty: 'Low' | 'Medium' | 'High'
  pit_timing_sensitivity: 'Medium' | 'High' | 'Extreme'
  tyre_degradation_impact: 'Low' | 'Medium' | 'High'
  chaos_level: 'Low' | 'Medium' | 'High' | 'Extreme'
}

// ── V4: Crossover Windows ─────────────────────────────────────────────────────

export type CrossoverWindow = {
  lap_start: number
  lap_end: number
  from_condition: string
  to_condition: string
  impact: 'Low' | 'Medium' | 'High'
  best_timed_drivers: string[]
  late_drivers: string[]
  early_drivers: string[]
  concurrent_sc: boolean
  summary: string
}

// ── V4: Weather Winners & Losers ──────────────────────────────────────────────

export type WeatherWinner = {
  driver_code: string
  gain: string
  reason: string
  confidence: 'Low' | 'Medium' | 'High'
}

export type WeatherLoser = {
  driver_code: string
  loss: string
  reason: string
  confidence: 'Low' | 'Medium' | 'High'
}

export type WeatherWinnersLosers = {
  winners: WeatherWinner[]
  losers: WeatherLoser[]
  confidence: 'Low' | 'Medium' | 'High'
  attribution_note: string | null
}

// ── V4: DRS Aggregated Trains ─────────────────────────────────────────────────

export type TrainDynamics = {
  train_breaker: string | null
  breaker_lap: number | null
  breaker_gap_opened: number | null
  dropped_drivers: string[]
  dynamics_confidence: 'Low' | 'Medium' | 'High'
  dynamics_note: string | null
}

export type MeaningfulDRSTrain = {
  lap_start: number
  lap_end: number
  duration_seconds: number
  peak_length: number
  leader: string | null
  trapped_drivers: string[]
  average_gap: number | null
  impact: 'Low' | 'Medium' | 'High'
  summary: string
  dynamics: TrainDynamics | null
}

export type DRSAnalysisAggregated = {
  meaningful_trains: MeaningfulDRSTrain[]
  total_raw_snapshots: number
  suppressed_by_sc: number
  peak_train: MeaningfulDRSTrain | null
}

// Legacy type — kept for stubs
export type DRSTrainSnapshot = {
  lap_number: number
  driver_codes: string[]
  gaps: number[]
  train_length: number
}

export type DRSTrainAnalysis = {
  trains_detected: number
  peak_train_length: number
  peak_train_lap: number | null
  most_affected_drivers: string[]
  snapshots: DRSTrainSnapshot[]
  summary: string
}

// ── V4: Clean Air Value ───────────────────────────────────────────────────────

export type DriverCleanAirEstimate = {
  driver_code: string
  gain: number
  context: string
  sample_in_train: number
  sample_post_train: number
  confidence: 'Low' | 'Medium' | 'High'
}

export type CleanAirValue = {
  estimated_gain: number | null
  confidence: 'Low' | 'Medium' | 'High'
  drivers: DriverCleanAirEstimate[]
  strategic_implication: string
}

// ── FullRaceAnalysis ──────────────────────────────────────────────────────────

export type FullRaceAnalysis = {
  race: RaceMeta
  race_brain: RaceBrain
  race_dna: RaceDNA | null
  race_phases: RacePhase[]
  true_pace: TruePaceRow[]
  tyre_degradation: TyreDegradationRow[]
  pit_impact: PitImpactRow[]
  chaos: ChaosIndex
  engineer_notes: EngineerNote[]
  decisions: RaceDecision[]
  weather_analysis: WeatherAnalysis | null
  crossover_windows: CrossoverWindow[]
  weather_winners_losers: WeatherWinnersLosers | null
  drs_trains: DRSAnalysisAggregated | null
  clean_air_value: CleanAirValue | null
}

// ── Race selector types ───────────────────────────────────────────────────────

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
