"""
Only a High-confidence stint may be promoted to a race decision.

Sorting High-cliff stints by slope alone put artefacts in the top five. Both
regression fixtures below are real, captured from production analyses:

  HAM, Madrid 2026 (11369): SOFT L1-6, +5.339 s/lap, Medium confidence.
      Lap times 104.8, 101.0, 99.8, 103.1, 111.9, 134.9 and then no lap 7 —
      the car was breaking, not the tyre.
  BOT, Baku 2026 (11377):   SOFT L27-36, +20.271 s/lap, Low confidence.
      Only L28/29/30 survived the pit-out and safety-car filters, and all three
      were drivers slowing for the incident that brought the SC out on L31.

Note for the record: "reject Low confidence" is not enough — HAM is Medium.
The rule is "require High", which is a sample-size rule (High means 12+ clean
laps entered the fit) and not a new threshold on the slope.
"""
from __future__ import annotations

import pytest

from app.domain.models import ChaosComponents, ChaosIndex, TyreDegradationRow
from app.services.decisions_service import DECISION_MIN_CONFIDENCE, _tyre_decisions, compute_decisions


def stint(code: str, compound: str, start: int, end: int, slope: float,
          confidence: str, cliff: str = "High") -> TyreDegradationRow:
    return TyreDegradationRow(
        driver_number=1, driver_code=code, compound=compound, stint_number=1,
        lap_start=start, lap_end=end, tyre_age_start=0,
        degradation_slope=slope, cliff_risk=cliff, confidence=confidence,
    )


HAM_MADRID = stint("HAM", "SOFT", 1, 6, 5.3388, "Medium")       # car breaking
BOT_BAKU = stint("BOT", "SOFT", 27, 36, 20.2710, "Low")          # 3 laps before an SC
MAG_LEGIT = stint("MAG", "HARD", 20, 36, 0.1819, "High")         # real degradation
TSU_LEGIT = stint("TSU", "HARD", 30, 46, 0.2737, "High")


# ── the two captured artefacts ───────────────────────────────────────────────

def test_ham_madrid_artefact_is_not_promoted():
    assert _tyre_decisions([HAM_MADRID], rank=1) == []


def test_bot_baku_artefact_is_not_promoted():
    assert _tyre_decisions([BOT_BAKU], rank=1) == []


def test_rejecting_only_low_confidence_would_not_have_caught_ham():
    """Guards the reasoning: the rule has to be 'require High', not 'reject Low'."""
    assert HAM_MADRID.confidence == "Medium"
    assert BOT_BAKU.confidence == "Low"
    assert DECISION_MIN_CONFIDENCE == "High"


# ── legitimate stints still get through ──────────────────────────────────────

def test_a_high_confidence_stint_is_promoted():
    out = _tyre_decisions([MAG_LEGIT], rank=3)
    assert len(out) == 1
    d = out[0]
    assert d.rank == 3 and d.confidence == "High"
    assert "MAG HARD" in d.title and "17 lap stint" in d.title
    assert "0.182" in d.impact


def test_the_high_confidence_stint_wins_even_with_a_much_smaller_slope():
    """The artefacts have slopes 30x and 100x larger; they must still lose."""
    out = _tyre_decisions([BOT_BAKU, HAM_MADRID, MAG_LEGIT], rank=1)
    assert len(out) == 1 and out[0].title.startswith("MAG")


def test_among_high_confidence_stints_the_steepest_still_wins():
    out = _tyre_decisions([MAG_LEGIT, TSU_LEGIT], rank=1)
    assert out[0].title.startswith("TSU")          # 0.274 > 0.182


def test_low_cliff_risk_is_still_excluded_whatever_the_confidence():
    assert _tyre_decisions([stint("X", "HARD", 1, 20, 0.01, "High", cliff="Low")], rank=1) == []


def test_no_stints_at_all_yields_no_decision():
    assert _tyre_decisions([], rank=1) == []


# ── the slot is filled, not lost ─────────────────────────────────────────────

def _chaos() -> ChaosIndex:
    return ChaosIndex(
        score=40, level="High", peak_chaos_lap=16,
        components=ChaosComponents(safety_car=0, yellow_flags=10, stewarding=16,
                                   weather=0, position_volatility=14),
        summary="High race.", method_version="2.0",
    )


def test_excluding_an_artefact_does_not_leave_a_hole_in_the_five():
    """A rejected artefact must not cost the report a decision."""
    with_artefact = compute_decisions([], [BOT_BAKU, MAG_LEGIT], _chaos(), 20, [])
    assert any(d.title.startswith("MAG") for d in with_artefact)
    assert not any("20.271" in (d.impact or "") for d in with_artefact)
    assert len(with_artefact) >= 2                      # chaos + pace still fill the list


def test_a_race_whose_only_cliff_is_an_artefact_simply_has_no_tyre_decision():
    out = compute_decisions([], [HAM_MADRID, BOT_BAKU], _chaos(), 20, [])
    assert not any("degradation" in (d.impact or "") for d in out)
    assert out, "the other decision kinds must still be produced"


# ── against the sessions cached in this repo ─────────────────────────────────

@pytest.mark.parametrize("session_key", [9197, 9539, 9566, 9636, 9662, 11377])
def test_cached_sessions_only_promote_high_confidence_tyre_stints(session_key):
    from app.core import cache
    analysis = cache.get_full_analysis(session_key)
    if analysis is None:
        pytest.skip(f"cache/{session_key}/_analysis.json not present")
    rows = [TyreDegradationRow.model_validate(r) for r in analysis["tyre_degradation"]]
    out = _tyre_decisions(rows, rank=1)
    assert len(out) <= 1
    for d in out:
        assert d.confidence == "High", f"{session_key} promoted a {d.confidence} stint"
        # and the slope is now in a physically sane range for tyre wear
        slope = float(d.impact.split("s/lap")[0].lstrip("+"))
        assert 0.0 < slope < 1.5, f"{session_key} promoted an implausible slope {slope}"
