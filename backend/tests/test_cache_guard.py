"""
The backend/cache/ guard in conftest.py (Block 26d) — it has to notice each
kind of change, and stay quiet when nothing changed.
"""
from __future__ import annotations

import os

from tests.conftest import cache_changes, cache_snapshot


def test_an_untouched_tree_reports_nothing(tmp_path):
    (tmp_path / "1" ).mkdir()
    (tmp_path / "1" / "_analysis.json").write_text("{}")
    assert cache_changes(cache_snapshot(tmp_path), cache_snapshot(tmp_path)) == []


def test_a_rewrite_a_new_file_and_a_deletion_are_all_reported(tmp_path):
    (tmp_path / "11377").mkdir()
    target = tmp_path / "11377" / "_analysis.json"
    target.write_text('{"a": 1}')
    gone = tmp_path / "meetings_2025.json"
    gone.write_text("[]")
    before = cache_snapshot(tmp_path)

    target.write_text('{"a": 1}')                     # same bytes, rewritten
    st = target.stat()
    os.utime(target, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000))
    (tmp_path / "meetings_2026.json").write_text("[]")
    gone.unlink()

    assert cache_changes(before, cache_snapshot(tmp_path)) == [
        "created meetings_2026.json",
        "deleted meetings_2025.json",
        f"modified {os.path.join('11377', '_analysis.json')}",
    ]
