"""Shared statistical utilities used across services."""
from __future__ import annotations

import statistics as _stats

import numpy as np


def median(values: list[float]) -> float:
    return _stats.median(values)


def is_outlier(value: float, all_values: list[float], threshold: float = 2.5) -> bool:
    """IQR-based outlier detection.  Returns True if value is an outlier."""
    if len(all_values) < 4:
        return False
    q1 = _stats.quantiles(all_values, n=4)[0]
    q3 = _stats.quantiles(all_values, n=4)[2]
    iqr = q3 - q1
    if iqr == 0:
        return False
    return value > q3 + threshold * iqr or value < q1 - threshold * iqr


def linear_slope(x_values: list[float], y_values: list[float]) -> float:
    """Return the linear regression slope (deg-1 polyfit) of y on x."""
    if len(x_values) < 2:
        return 0.0
    x = np.array(x_values, dtype=float)
    y = np.array(y_values, dtype=float)
    return float(np.polyfit(x, y, 1)[0])


def confidence_from_sample(n: int) -> str:
    """High ≥12 laps, Medium ≥6, else Low."""
    if n >= 12:
        return "High"
    if n >= 6:
        return "Medium"
    return "Low"


def cliff_risk_from_slope(slope: float) -> str:
    """High ≥0.08 s/lap, Medium ≥0.04, else Low."""
    if slope >= 0.08:
        return "High"
    if slope >= 0.04:
        return "Medium"
    return "Low"
