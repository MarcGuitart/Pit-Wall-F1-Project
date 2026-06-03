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


class FullRaceAnalysis(BaseModel):
    race: RaceMeta
    race_brain: RaceBrain
    true_pace: list[TruePaceRow]
    tyre_degradation: list[TyreDegradationRow]
    pit_impact: list[PitImpactRow]
    chaos: ChaosIndex
    engineer_notes: list[EngineerNote]
    decisions: list[RaceDecision]


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
