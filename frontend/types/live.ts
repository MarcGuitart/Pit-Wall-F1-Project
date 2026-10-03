/**
 * The live snapshot, as backend/scripts/live_state.py publishes it.
 *
 * One rule shapes every optional field here: a live reading is not a finished
 * one. `chaos.level` is null until the chequered flag because the score's
 * denominator is the laps run so far; a pit cycle carries no deltas until it
 * closes; a pit-window signal is a measurement with a confidence, never a
 * predicted stop lap. Components must render the absence, not paper over it.
 */

export type Flag = 'GREEN' | 'YELLOW' | 'SC' | 'VSC' | 'RED'

export type TrackStatus = {
  flag: Flag
  since: string | null
  source: string
  neutralised_laps: number[]
}

export type TowerRow = {
  position: number
  driver_number: number
  code: string
  full_name: string | null
  team: string | null
  colour: string | null
  lap_number: number | null
  /** The last lap actually completed, which lags `lap_number` by one. */
  last_lap_s: number | null
  last_lap_number: number | null
  gap_to_leader: number | string | null
  interval: number | string | null
  compound: string | null
  stint_number: number | null
  stint_laps: number | null
  tyre_age_at_start: number | null
  tyre_age: number | null
  stops: number
  pit_laps: number[]
  is_pit_out_lap: boolean | null
}

export type ChaosBreakdownRow = {
  component: string
  raw: number
  raw_unit: string
  normalized: number
  points: number
  weight: number
  note: string | null
}

export type LiveChaos = {
  /** null before MIN_CHAOS_LAPS — the denominator is too small to mean anything. */
  score: number | null
  /** null while the race is running — see the note at the top of this file. */
  level: 'Low' | 'Medium' | 'High' | 'Extreme' | null
  final: boolean
  label: string
  denominator_laps: number
  race_distance: number | null
  race_distance_source: string
  method_version: string
  peak_chaos_lap: number | null
  breakdown: ChaosBreakdownRow[]
  caveat: string
}

export type LiveNote = {
  id: string
  lap_number: number | null
  type: 'TRACK_STATUS' | 'PIT_CYCLE' | 'CHAOS' | 'BATTLE' | 'FEED'
  severity: 'Low' | 'Medium' | 'High'
  title: string
  message: string
  confidence: 'Low' | 'Medium' | 'High'
}

export type PitWatchSignal = {
  driver_number: number
  driver_code: string
  kind: 'STINT_LENGTH' | 'PACE_LOSS' | 'UNDERCUT_EXPOSURE' | 'CHEAP_STOP_WINDOW'
  headline: string
  measurement: string
  confidence: 'Low' | 'Medium' | 'High'
  basis: string
  disclaimer: string
}

export type RadioClip = {
  driver_number: number | null
  code: string
  date: string | null
  lap_number: number | null
  recording_url: string | null
}

export type PitCycleLive = {
  cycle_id: number
  lap_start: number
  lap_end: number
  stops: number
  neutralised: boolean
  status: 'closed' | 'in progress'
  closes_on_lap: number
  close_lap: number | null
  timing: string | null
  summary: string
  undercuts: { attacker: string; target: string; attacker_lap: number; target_lap: number }[]
  participants: {
    driver_number: number
    driver_code: string
    stopped: boolean
    stop_laps: number[]
    position_before: number | null
    position_after?: number | null
    delta?: number | null
  }[]
}

export type FeedHealth = {
  mode: 'mqtt' | 'replay'
  connected: boolean
  racing: boolean
  last_message_age_s: number | null
  stale: boolean
  stale_after_s: number
  messages_total: number
  messages: Record<string, number>
  documents: Record<string, number>
  last_update?: Record<string, string>
  gaps_observed: { from: string; to: string; seconds: number; at_lap: number }[]
  gaps_observed_total: number
  token_expires_in_s: number | null
  renewals: number
  browsers: number
}

export type DashboardCar = {
  driver_number: number
  code: string
  colour: string | null
  speed: number | null
  rpm: number | null
  gear: number | null
  throttle: number | null
  brake: number | null
  drs: number | null
  x: number | null
  y: number | null
}

export type RaceControlMessage = {
  date: string | null
  category: string | null
  flag: string | null
  message: string | null
  scope: string | null
  sector: number | null
  lap_number: number | null
  driver_number: number | null
}

export type StintRecord = {
  stint_number: number
  compound: string | null
  lap_start: number | null
  lap_end: number | null
  tyre_age_at_start: number | null
}

export type LapDetail = {
  best_lap: number
  best_s: number
  last_lap: number
  last_s: number
  last: { sector1: number | null; sector2: number | null; sector3: number | null; i1_speed: number | null; i2_speed: number | null; st_speed: number | null }
  best_sectors: { sector1: number | null; sector2: number | null; sector3: number | null }
}

export type LiveDashboard = {
  cars: DashboardCar[]
  /** driver_number -> [speed, throttle, brake][], oldest first, ~13 s */
  car_history: Record<string, [number | null, number | null, number | null][]>
  track: { outline: [number, number][] | null; bounds: [number, number, number, number] | null }
  race_control: RaceControlMessage[]
  weather: {
    air_temperature: number | null
    track_temperature: number | null
    humidity: number | null
    pressure: number | null
    rainfall: number | null
    wind_speed: number | null
    wind_direction: number | null
    date: string | null
    track_history: [string, number][]
  }
  stints: Record<string, StintRecord[]>
  pit_stops: {
    driver_number: number | null
    code: string
    lap_number: number | null
    date: string | null
    pit_duration: number | null
    lane_duration: number | null
    stop_duration: number | null
  }[]
  pit_stops_total: number
  records: { driver_number: number; code: string; lap_number: number; time_s: number; at: string | null; improvement_s: number | null }[]
  overtakes: { date: string | null; overtaking: number | null; overtaken: number | null; position: number | null; lap_number: number | null; overtaking_code: string | null; overtaken_code: string | null }[]
  /** driver_number -> [lap, seconds, is_pit_out_lap][] */
  lap_times: Record<string, [number, number, boolean][]>
  laps_detail: Record<string, LapDetail>
  error?: string
}

export type LiveProjection = {
  kind: 'race' | 'pole'
  simulations: number
  reason?: string
  error?: string
  confidence?: 'Low' | 'Medium' | 'High'
  total_laps?: number | null
  total_laps_source?: string
  lap?: number
  laps_left?: number
  pit_loss_s?: number
  pit_loss_source?: string
  sc_probability?: number
  drivers: {
    driver_number: number
    code: string
    colour: string | null
    position: number
    win: number
    podium?: number
    projected_position?: number
    range?: [number, number]
    pace_s?: number
    wear_s_per_lap?: number
    stops_owed?: number
    compound?: string | null
    tyre_age?: number
    best_s?: number
    ideal_s?: number | null
  }[]
}

export type LiveSnapshot = {
  session_key: number | null
  session_info?: {
    date_start?: string | null
    date_end?: string | null
    gmt_offset?: string | null
    circuit_short_name?: string | null
    country_name?: string | null
    year?: number | null
  }
  dashboard?: LiveDashboard
  projection?: LiveProjection
  session_type?: string | null
  session_name?: string | null
  location?: string | null
  profile?: 'practice' | 'qualifying' | 'race'
  generated_at: string
  uptime_s: number
  current_lap: number
  race_distance: number | null
  race_distance_source: string
  laps_remaining: number | null
  chequered: boolean
  chequered_lap: number | null
  track_status: TrackStatus
  drivers_known: number
  tower: TowerRow[]
  practice_tower?: PracticeTowerRow[]
  pace?: LivePaceRow[]
  long_runs?: LongRunRow[]
  session_status?: {
    flag: Flag
    since: string | null
    source: string
    red_flags: number
    minutes_under_red: number
    periods: { flag: Flag; start: string; end: string; duration_s: number }[]
  } | null
  radio: RadioClip[]
  feed: FeedHealth
  chaos: LiveChaos | null
  notes: LiveNote[]
  pit_watch: PitWatchSignal[]
  analysis: {
    profile?: string
    inputs: Record<string, number>
    weather?: {
      ok: boolean
      air_temperature?: number | null
      track_temperature?: number | null
      track_temperature_trend?: 'rising' | 'falling' | 'steady' | null
      rainfall?: number | null
      rain_periods?: number
      wet_laps?: number[]
      note?: string
      error?: string
    }
    session_timeline?: {
      bands: { flag: Flag; start: string; end: string; duration_s: number }[]
      markers: { type: string; at: string | null; code?: string; lap_number?: number; time_s?: number }[]
    }
    timeline?: { ok: boolean; total_laps?: number; error?: string }
    pit?: { ok: boolean; cycles?: PitCycleLive[]; stops?: number; open_cycles?: number; settle_laps?: number; error?: string }
  }
}

export type PracticeTowerRow = {
  position: number
  driver_number: number
  code: string
  full_name: string | null
  team: string | null
  colour: string | null
  best_lap_number: number
  best_lap_s: number
  gap_to_p1: number | null
  sectors: Record<'sector1' | 'sector2' | 'sector3', { time: number | null; colour: 'purple' | 'green' | 'yellow' | null }>
  speed_traps?: { i1_speed: number | null; i2_speed: number | null; st_speed: number | null }
  segments?: { seg1: number[] | null; seg2: number[] | null; seg3: number[] | null }
  ideal_lap: { sector1: number; sector2: number; sector3: number; total: number } | null
  laps: number
  clean_laps: number
  compound: string | null
  tyre_age: number | null
  stops: number
}

export type LongRunRow = {
  driver_number: number
  code: string
  lap_start: number
  lap_end: number
  laps: number
  median_s: number
  compound: string | null
  confidence: 'Low' | 'Medium' | 'High'
}

export type LivePaceRow = {
  driver_number: number
  code: string
  median_clean_lap_s: number
  fastest_clean_lap_s: number
  sample_size: number
  confidence: 'Low' | 'Medium' | 'High'
}
