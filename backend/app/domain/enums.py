from enum import Enum


class CliffRisk(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"


class Confidence(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"


class NoteType(str, Enum):
    TYRE_DEGRADATION = "TYRE_DEGRADATION"
    UNDERCUT = "UNDERCUT"
    PIT_IMPACT = "PIT_IMPACT"
    CHAOS = "CHAOS"
    TRAFFIC = "TRAFFIC"
    TRUE_PACE = "TRUE_PACE"
    WEATHER = "WEATHER"
    ANOMALY = "ANOMALY"


class Severity(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"


class ChaosLevel(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"
    EXTREME = "Extreme"


class StrategicTension(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"
