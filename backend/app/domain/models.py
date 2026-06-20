from pydantic import BaseModel
from typing import Optional, Literal


class RaceMeta(BaseModel):
    meeting_key: int
    session_key: int
    meeting_name: str
    session_name: str
    circuit_short_name: Optional[str] = None
    country_name: Optional[str] = None
    year: int


class RaceBrain(BaseModel):
    race_phase: str
    main_question: str
    chaos_index: int
    best_compound: Optional[str] = None
    strategic_tension: Literal["Low", "Medium", "High"]
    summary: str


class TruePaceRow(BaseModel):
    driver_number: int
    driver_code: str
    team_name: Optional[str] = None
    team_colour: Optional[str] = None
    rank: int
    median_lap: float
    clean_pace: float
    traffic_score: float
    sample_size: int
    confidence: Literal["Low", "Medium", "High"]
    exclusion_log: list[str]
    verdict: str


class TyreDegradationRow(BaseModel):
    driver_number: int
    driver_code: str
    compound: str
    stint_number: int
    lap_start: int
    lap_end: int
    tyre_age_start: Optional[int] = None
    degradation_slope: float
    cliff_risk: Literal["Low", "Medium", "High"]
    confidence: Literal["Low", "Medium", "High"]


class PitImpactRow(BaseModel):
    driver_number: int
    driver_code: str
    lap_number: int
    lane_duration: Optional[float] = None
    stop_duration: Optional[float] = None
    position_before: Optional[int] = None
    position_after: Optional[int] = None
    net_position_change: Optional[int] = None
    verdict: str
    confidence: Literal["Low", "Medium", "High"]


class ChaosComponents(BaseModel):
    safety_car: int
    yellow_flags: int
    investigations: int
    penalties: int
    weather: int
    position_volatility: int


class ChaosIndex(BaseModel):
    score: int
    level: Literal["Low", "Medium", "High", "Extreme"]
    peak_chaos_lap: Optional[int] = None
    components: ChaosComponents
    summary: str


class EngineerNote(BaseModel):
    lap_number: Optional[int] = None
    type: Literal[
        "TYRE_DEGRADATION",
        "UNDERCUT",
        "PIT_IMPACT",
        "CHAOS",
        "TRAFFIC",
        "TRUE_PACE",
        "WEATHER",
        "ANOMALY",
    ]
    severity: Literal["Low", "Medium", "High"]
    title: str
    message: str


class RaceDecision(BaseModel):
    rank: int
    lap_number: Optional[int] = None
    title: str
    impact: str
    explanation: str
    confidence: Literal["Low", "Medium", "High"]


class WeatherEvent(BaseModel):
    lap_number: Optional[int] = None
    event_type: Literal["RAIN_ONSET", "RAIN_END", "TEMP_SPIKE", "TEMP_DROP", "PEAK_RAIN"]
    track_temp: float
    air_temp: float
    rainfall: float
    message: str


class WeatherLap(BaseModel):
    lap_number: int
    track_temp: float
    air_temp: float
    rainfall: float
    condition: Literal["DRY", "DAMP", "WET"]


class WeatherAnalysis(BaseModel):
    dry_laps: int
    damp_laps: int
    wet_laps: int
    avg_track_temp: float
    min_track_temp: float
    max_track_temp: float
    peak_rainfall_lap: Optional[int] = None
    events: list[WeatherEvent]
    lap_conditions: list[WeatherLap]
    strategy_impact: Literal["None", "Low", "Medium", "High"]
    summary: str


class DRSTrainSnapshot(BaseModel):
    lap_number: int
    driver_codes: list[str]
    gaps: list[float]          # gap between consecutive cars in the chain
    train_length: int



# ── V4: Race phases ────────────────────────────────────────────────────────

class RacePhase(BaseModel):
    lap_start: int
    lap_end: int
    phase: str
    impact: Literal["Low", "Medium", "High"]
    reason: str
    color_token: str  # "green"|"amber"|"red"|"blue"|"purple"|"muted"


# ── V4: Race DNA ───────────────────────────────────────────────────────────

class RaceDNA(BaseModel):
    primary_factor: str
    secondary_factor: str
    strategy_type: str
    overtaking_difficulty: Literal["Low", "Medium", "High"]
    pit_timing_sensitivity: Literal["Medium", "High", "Extreme"]
    tyre_degradation_impact: Literal["Low", "Medium", "High"]
    chaos_level: Literal["Low", "Medium", "High", "Extreme"]


# ── V4: DRS aggregation ────────────────────────────────────────────────────

class TrainDynamics(BaseModel):
    train_breaker: Optional[str] = None
    breaker_lap: Optional[int] = None
    breaker_gap_opened: Optional[float] = None
    dropped_drivers: list[str] = []
    dynamics_confidence: Literal["Low", "Medium", "High"] = "Low"
    dynamics_note: Optional[str] = None


class MeaningfulDRSTrain(BaseModel):
    lap_start: int
    lap_end: int
    duration_seconds: int
    peak_length: int
    leader: Optional[str] = None
    trapped_drivers: list[str] = []
    average_gap: Optional[float] = None
    impact: Literal["Low", "Medium", "High"]
    summary: str
    dynamics: Optional[TrainDynamics] = None


class DRSAnalysisAggregated(BaseModel):
    meaningful_trains: list[MeaningfulDRSTrain]
    total_raw_snapshots: int
    suppressed_by_sc: int
    peak_train: Optional[MeaningfulDRSTrain] = None


# ── V4: Crossover windows ──────────────────────────────────────────────────

class CrossoverWindow(BaseModel):
    lap_start: int
    lap_end: int
    from_condition: str
    to_condition: str
    impact: Literal["Low", "Medium", "High"]
    best_timed_drivers: list[str]
    late_drivers: list[str]
    early_drivers: list[str]
    concurrent_sc: bool
    summary: str


class WeatherWinner(BaseModel):
    driver_code: str
    gain: str
    reason: str
    confidence: Literal["Low", "Medium", "High"]


class WeatherLoser(BaseModel):
    driver_code: str
    loss: str
    reason: str
    confidence: Literal["Low", "Medium", "High"]


class WeatherWinnersLosers(BaseModel):
    winners: list[WeatherWinner]
    losers: list[WeatherLoser]
    confidence: Literal["Low", "Medium", "High"]
    attribution_note: Optional[str] = None


# ── V4: Clean air value ────────────────────────────────────────────────────

class DriverCleanAirEstimate(BaseModel):
    driver_code: str
    gain: float
    context: str
    sample_in_train: int
    sample_post_train: int
    confidence: Literal["Low", "Medium"]    # never "High"


class CleanAirValue(BaseModel):
    estimated_gain: Optional[float] = None  # None if data insufficient
    confidence: Literal["Low", "Medium"]    # never "High"
    drivers: list[DriverCleanAirEstimate] = []
    strategic_implication: str


# ── Updated FullRaceAnalysis ───────────────────────────────────────────────

class FullRaceAnalysis(BaseModel):
    race: RaceMeta
    race_brain: RaceBrain
    # V4 — deterministic race fingerprint
    race_dna: Optional[RaceDNA] = None
    race_phases: list[RacePhase] = []
    # Core services
    true_pace: list[TruePaceRow]
    tyre_degradation: list[TyreDegradationRow]
    pit_impact: list[PitImpactRow]
    chaos: ChaosIndex
    engineer_notes: list[EngineerNote]
    decisions: list[RaceDecision]
    # V3 — weather, enhanced in V4
    weather_analysis: Optional[WeatherAnalysis] = None
    # V4 — crossover windows and weather winners/losers
    crossover_windows: list[CrossoverWindow] = []
    weather_winners_losers: Optional[WeatherWinnersLosers] = None
    # V4 — DRS aggregated (replaces old DRSTrainAnalysis)
    drs_trains: Optional[DRSAnalysisAggregated] = None
    # V4 — clean air value
    clean_air_value: Optional[CleanAirValue] = None


class RaceListItem(BaseModel):
    meeting_key: int
    meeting_name: str
    country_name: Optional[str] = None
    circuit_short_name: Optional[str] = None
    date_start: Optional[str] = None
    year: int


class SessionInfo(BaseModel):
    session_key: int
    session_name: str
    session_type: str
    date_start: Optional[str] = None


# ── Circuit Telemetry (FastF1 — loaded lazily) ─────────────────────────────

class TelemetryPoint(BaseModel):
    distance: float        # meters along lap
    x: float               # normalised -1..1
    y: float               # normalised -1..1
    speed: float           # km/h
    throttle: float        # 0–100
    brake: bool
    gear: int              # 1–8
    drs: int               # 0=closed, 10/12/14=open
    lap_number: Optional[int] = None
    race_time: Optional[float] = None


class DriverTelemetry(BaseModel):
    driver_code: str
    team_colour: str       # hex e.g. "#FF8000"
    lap_time: float        # seconds
    fastest_lap_number: int
    points: list[TelemetryPoint]
    sector_1_time: Optional[float] = None
    sector_2_time: Optional[float] = None
    sector_3_time: Optional[float] = None


class CircuitPoint(BaseModel):
    x: float
    y: float
    distance: float


class TelemetryData(BaseModel):
    circuit_key: str       # e.g. "brazil_2024"
    circuit_name: str
    year: int
    session_type: str
    circuit_outline: list[CircuitPoint]
    drivers: list[DriverTelemetry]
    sector_boundaries: dict  # {"sector_1_end": float, "sector_2_end": float}
    total_distance: float
    confidence: str
    source: str            # "FastF1"
    note: Optional[str] = None
