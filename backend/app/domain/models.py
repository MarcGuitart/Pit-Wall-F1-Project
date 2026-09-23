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
    median_clean_lap: float
    fastest_clean_lap: float
    traffic_score: float
    sample_size: int
    confidence: Literal["Low", "Medium", "High"]
    exclusion_log: list[str]
    verdict: str
    # Actual race result — deliberately separate from `rank` (True Pace strips
    # out pit/SC/traffic; the finishing position doesn't). Shown side by side
    # so the two are never mistaken for one another.
    grid_position: Optional[int] = None
    finishing_position: Optional[int] = None
    positions_gained: Optional[int] = None


class RaceClassificationRow(BaseModel):
    driver_number: int
    driver_code: str
    team_name: Optional[str] = None
    team_colour: Optional[str] = None
    grid_position: Optional[int] = None
    finishing_position: Optional[int] = None
    positions_gained: Optional[int] = None


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


StopType = Literal["racing", "safety_car", "red_flag"]


class PitImpactRow(BaseModel):
    driver_number: int
    driver_code: str
    lap_number: int
    lane_duration: Optional[float] = None       # primary metric
    stop_duration: Optional[float] = None       # stationary time; only from USGP 2024 on, informational
    stop_type: StopType = "racing"              # see pit_service: red-flag/SC stops are not judged
    cycle_id: Optional[int] = None              # PitCycle this stop belongs to (None for red-flag holds)
    position_before: Optional[int] = None       # at the start of the stop lap
    position_after: Optional[int] = None        # at the close of the pit cycle (red flag: lap + 3)
    net_position_change: Optional[int] = None
    verdict: str
    confidence: Literal["Low", "Medium", "High"]


class PitCycleDriver(BaseModel):
    driver_number: int
    driver_code: str
    stopped: bool                               # False: in the cycle only because others stopped
    stop_laps: list[int] = []
    position_before: int                        # start of the lap before the cycle opened
    position_after: int                         # start of close_lap
    delta: int                                  # positive = gained places through the cycle


class Undercut(BaseModel):
    attacker: str
    target: str
    attacker_lap: int
    target_lap: int


class PitCycle(BaseModel):
    """A window of laps in which a group of rivals stopped — see pit_cycle_service."""
    cycle_id: int
    lap_start: int
    lap_end: int
    close_lap: int
    stops: int
    neutralised: bool                           # SC/VSC inside the window: timing attribution unreliable
    # Plain statement of the order of events, e.g. "opened on L24, before the
    # VSC on L28 (4 laps later) and the SC on L30" — so a reader (or the chat
    # model) cannot claim the neutralisation triggered the stops.
    timing: str = ""
    participants: list[PitCycleDriver]
    undercuts: list[Undercut] = []
    summary: str


class ChaosComponent(BaseModel):
    """One auditable term of the Chaos Index: raw measurement → 0-1 → points."""
    raw: float
    raw_unit: str
    normalized: float           # min(1, raw / full_scale)
    full_scale: float           # raw value that earns the full weight
    weight: int                 # max points
    points: float               # normalized * weight
    note: Optional[str] = None


class ChaosComponents(BaseModel):
    """Points per component (rounded) — the quick view; see ChaosIndex.breakdown for the audit."""
    safety_car: int
    yellow_flags: int
    stewarding: int             # incidents noted + penalties (v1 had investigations + penalties)
    weather: int
    position_volatility: int


class ChaosIndex(BaseModel):
    score: int
    level: Literal["Low", "Medium", "High", "Extreme"]
    peak_chaos_lap: Optional[int] = None
    components: ChaosComponents
    breakdown: dict[str, ChaosComponent] = {}
    summary: str
    method_version: str = "1.0"     # "2.0" = fraction-of-race method (chaos_service.METHOD_VERSION)


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
    event_type: Literal["RAIN_ONSET", "RAIN_END", "TEMP_SPIKE", "TEMP_DROP"]
    track_temp: float
    air_temp: float
    rainfall: float
    message: str


class WeatherLap(BaseModel):
    lap_number: int
    track_temp: float
    air_temp: float
    rainfall: float                 # 1.0 = wet lap, 0.0 = dry (OpenF1 flag, not mm)
    condition: Literal["DRY", "WET"]


class WeatherAnalysis(BaseModel):
    dry_laps: int
    wet_laps: int
    avg_track_temp: float
    min_track_temp: float
    max_track_temp: float
    peak_rainfall_lap: Optional[int] = None   # always None: rainfall is a 0/1 flag
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


# ── Team radio (archive clips, F1 CDN links) ────────────────────────────────

class TeamRadioClip(BaseModel):
    driver_number: int
    driver_code: str
    team_name: Optional[str] = None
    date: str                                   # ISO 8601 UTC
    lap_number: Optional[int] = None            # None for pre/post-session clips
    phase: Literal["pre", "race", "post"]
    recording_url: str                          # F1 CDN, path percent-encoded; not mirrored


class TeamRadioAnalysis(BaseModel):
    clips: list[TeamRadioClip]
    total: int
    in_race: int
    pre_session: int
    post_session: int
    clips_per_driver: dict[str, int]
    summary: str


# ── Per-module status ──────────────────────────────────────────────────────

class ModuleStatus(BaseModel):
    """
    ok              — computed, has content
    not_applicable  — computed fine, nothing to show for this race (dry race, no DRS trains…)
    failed          — the service raised; the field is empty because of an error
    """
    status: Literal["ok", "failed", "not_applicable"]
    reason: Optional[str] = None


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
    pit_cycles: list[PitCycle] = []
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
    # Actual race result, independent of True Pace ranking
    race_classification: list[RaceClassificationRow] = []
    team_radio: Optional[TeamRadioAnalysis] = None
    # V4 modules: why a field above is empty. Keyed by field name. Empty for old caches.
    modules: dict[str, ModuleStatus] = {}


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
    lat_g: Optional[float] = None   # lateral G (positive = left)
    lon_g: Optional[float] = None   # longitudinal G (positive = acceleration)
    lap_number: Optional[int] = None
    race_time: Optional[float] = None


class DriverTelemetry(BaseModel):
    driver_code: str
    team_colour: str       # hex e.g. "#FF8000"
    lap_time: float        # seconds
    fastest_lap_number: int
    lap_mode: str = "fastest_clean"   # "fastest_clean" | "representative"
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
