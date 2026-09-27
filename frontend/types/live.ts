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
  gaps_observed: { from: string; to: string; seconds: number; at_lap: number }[]
  gaps_observed_total: number
  token_expires_in_s: number | null
  renewals: number
  browsers: number
}

export type LiveSnapshot = {
  session_key: number | null
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
  radio: RadioClip[]
  feed: FeedHealth
  chaos: LiveChaos | null
  notes: LiveNote[]
  pit_watch: PitWatchSignal[]
  analysis: {
    inputs: Record<string, number>
    timeline?: { ok: boolean; total_laps?: number; error?: string }
    weather?: { ok: boolean; rain_periods?: number; wet_laps?: number[]; note?: string; error?: string }
    pit?: { ok: boolean; cycles?: PitCycleLive[]; stops?: number; open_cycles?: number; settle_laps?: number; error?: string }
  }
}
