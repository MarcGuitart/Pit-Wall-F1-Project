// Circuit Telemetry types — loaded on demand from /telemetry/{session_key}.
// Kept separate from index.ts because telemetry is a lazy, opt-in feature.

export type TelemetryPoint = {
  distance: number // meters along lap, or race seconds for OpenF1 full-race traces
  x: number // normalised -1..1
  y: number // normalised -1..1
  speed: number // km/h
  throttle: number // 0–100
  brake: boolean
  gear: number // 1–8
  drs: number // 0=closed, 10/12/14=open
  lat_g?: number | null  // lateral G-force (positive = left)
  lon_g?: number | null  // longitudinal G-force (positive = acceleration)
  lap_number?: number | null
  race_time?: number | null
}

export type DriverTelemetry = {
  driver_code: string
  team_colour: string // hex e.g. "#FF8000"
  lap_time: number // seconds
  fastest_lap_number: number
  points: TelemetryPoint[]
  sector_1_time: number | null
  sector_2_time: number | null
  sector_3_time: number | null
}

export type CircuitPoint = {
  x: number
  y: number
  distance: number
}

export type SectorBoundaries = {
  sector_1_end: number
  sector_2_end: number
}

export type TelemetryData = {
  circuit_key: string
  circuit_name: string
  year: number
  session_type: string
  circuit_outline: CircuitPoint[]
  drivers: DriverTelemetry[]
  sector_boundaries: SectorBoundaries
  total_distance: number
  confidence: string
  source: string // "FastF1"
  note: string | null
}

export type TelemetryMetric = 'SPEED' | 'THROTTLE' | 'BRAKE' | 'GEAR'
