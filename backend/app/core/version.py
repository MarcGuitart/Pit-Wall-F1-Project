"""
Version of the analysis pipeline as a whole.

chaos.method_version only covers the Chaos Index. Every other service can
change its output too, and when one does, the analyses already written to disk
(and committed to the repo, and served from Render) become stale with nothing
to detect it. ANALYSIS_VERSION is that detector: it is stamped into the root of
_analysis.json, and the cache guard in api/analysis.py recomputes any cached
analysis whose stamp does not match.

Bump it whenever ANY service changes the content of a response — a new field,
a different value for the same input, a new module, a changed threshold. Do not
bump it for comments, tests, logging or refactors that leave the output byte
for byte identical.

History (most recent first):
  4  decisions: only a High-confidence tyre stint may become a decision
     (fix(decisions), 2026-09). Changed the tyre decision in 9566, 9662 and
     11377 with nothing detecting it, which is why this constant now exists.
     Also in 4: race_brain.summary listed the cliff-risk drivers in set order,
     so the same race produced a different string on every regeneration.
  3  pit cycles as the causal unit; stop_type from the pit timestamp; team
     radio; lane time judged against the race baseline.
  2  Chaos Index method 2.0 (fraction of the race in an altered state),
     per-module ok/failed/not_applicable status.
  1  pre-versioning; anything without a stamp is treated as this and recomputed.
"""
from __future__ import annotations

ANALYSIS_VERSION = "4"
