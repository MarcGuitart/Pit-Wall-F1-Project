"""
INTERNAL_BUILD_SECRET, checked end to end — Block 22.

Production symptom: the publication Action sent X-Internal-Build-Secret and
still got 402 PRO_REQUIRED. Block 18's own tests (test_pro_access.py,
test_autopublish.py) never caught this because they each test one side in
isolation — the gate with a manually-set header, and compute() with a mocked
TestClient that never actually reaches the gate. Neither test wires the two
real pieces together, which is exactly how a rename on either side could slip
through unnoticed.

Three things this file checks, each closing one way the bug could still
happen:

  1. The env var name the workflow sets and the one Settings actually reads
     are the same string — read from the real files, not restated as a
     hand-copied literal that could itself drift.
  2. The header name compute() sends and the one the gate reads are the same
     string, case-insensitively — same approach.
  3. With the secret set, calling the *real* compute() (not a mocked
     TestClient) against a real PRO-season session actually gets past the
     gate; with it unset, the same call is still refused. Either half of that
     pair failing silently is what "nothing detects this" meant.

Conclusion from checks 1 and 2 (see the report): the names already agree.
Everything here passes today, which means the production 402 was not a naming
bug — see the block's own report for where it actually was.
"""
from __future__ import annotations

import asyncio
import importlib.util
import re
import shutil
from pathlib import Path

import pytest
from pydantic import SecretStr

from app.core.config import settings

BACKEND_ROOT = Path(__file__).resolve().parent.parent
WORKFLOW = BACKEND_ROOT.parent / ".github" / "workflows" / "publish-race.yml"
ACCESS_SOURCE = (BACKEND_ROOT / "app" / "core" / "access.py").read_text()
SCRIPT_SOURCE = (BACKEND_ROOT / "scripts" / "autopublish.py").read_text()

PRO_SESSION_KEY = 11377  # Baku 2026 — PRO season; its published _analysis.json is versioned


def _load_autopublish_script():
    spec = importlib.util.spec_from_file_location(
        "autopublish_script_e2e", BACKEND_ROOT / "scripts" / "autopublish.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# ── 1. the env var name ──────────────────────────────────────────────────────

def test_the_workflow_sets_the_same_env_var_settings_reads():
    """
    Static, no network: read the workflow file's literal env var name for the
    publish step, and compare it against what pydantic-settings actually
    derives from Settings.internal_build_secret — proven by import, not by a
    second hand-typed "INTERNAL_BUILD_SECRET" string that could itself be
    wrong.
    """
    assert WORKFLOW.exists(), f"workflow file moved or renamed: {WORKFLOW}"
    text = WORKFLOW.read_text()

    # The line that feeds the secret into the "Decide and compute" step's env —
    # scoped to a line mentioning BUILD_SECRET, since the workflow sets several
    # other secrets (OPENF1_USERNAME, etc.) with the same NAME: ${{ secrets.NAME }}
    # shape, and the first such line in the file is not necessarily this one.
    match = re.search(r'^\s*(\w*BUILD_SECRET\w*):\s*\$\{\{\s*secrets\.(\w+)\s*\}\}', text, re.M)
    assert match, "no `*BUILD_SECRET*: ${{ secrets.* }}` line found in the workflow"
    env_var_name, github_secret_name = match.group(1), match.group(2)

    # What the running Settings object actually resolved it from: set a
    # sentinel through the real env-var mechanism and confirm it is picked up
    # under exactly the name the workflow uses — not asserted as a literal.
    import os
    sentinel = "e2e-sentinel-value-not-a-real-secret"
    os.environ[env_var_name] = sentinel
    try:
        from app.core.config import Settings
        fresh = Settings()
        assert fresh.internal_build_secret.get_secret_value() == sentinel, (
            f"the workflow sets {env_var_name}, but Settings.internal_build_secret "
            f"did not pick it up under that name"
        )
    finally:
        del os.environ[env_var_name]

    # And the workflow should be pulling it from a GitHub secret of the same
    # name — nothing stops someone naming the repo secret differently from the
    # env var it is assigned to, which would be its own quiet way to break this.
    assert github_secret_name == env_var_name, (
        f"the workflow reads GitHub secret '{github_secret_name}' but exposes it as "
        f"env var '{env_var_name}' — name them the same so the one secret to create "
        f"in GitHub Settings has no room for a mismatch"
    )


# ── 2. the header name ───────────────────────────────────────────────────────

def test_the_script_sends_the_same_header_the_gate_reads():
    """Same approach for the header, since it is a second independent string
    that has to match — this time compared case-insensitively, since HTTP
    header names are."""
    sent = re.search(r'headers\["([^"]+)"\]\s*=\s*secret', SCRIPT_SOURCE)
    assert sent, "scripts/autopublish.py no longer sets a literal header for the build secret"
    header_sent = sent.group(1)

    # Scoped to has_internal_build_access() specifically — app/core/access.py
    # also reads the "authorization" header elsewhere (bearer_token(), for the
    # PRO user-token path), and a plain first-match search would silently grab
    # that one instead.
    func_match = re.search(r'def has_internal_build_access.*?(?=\ndef |\Z)', ACCESS_SOURCE, re.S)
    assert func_match, "has_internal_build_access() not found in app/core/access.py"
    read = re.search(r'request\.headers\.get\("([^"]+)"', func_match.group(0))
    assert read, "has_internal_build_access() no longer reads a literal header for the build secret"
    header_read = read.group(1)

    assert header_sent.lower() == header_read.lower(), (
        f"compute() sends '{header_sent}' but has_internal_build_access() reads "
        f"'{header_read}' — HTTP headers are case-insensitive so this would still work, "
        f"but keep them textually aligned so a future refactor cannot accidentally make "
        f"the comparison case-sensitive and silent break this"
    )


# ── 3. wired together for real ───────────────────────────────────────────────

@pytest.fixture(autouse=True)
def isolated_cache(monkeypatch, tmp_path):
    """
    compute() writes _analysis.json as it goes. Point it at a copy of 11377's
    cache so the versioned backend/cache/11377/_analysis.json is never
    rewritten by a test run (Block 26d).
    """
    shutil.copytree(BACKEND_ROOT / "cache" / str(PRO_SESSION_KEY), tmp_path / str(PRO_SESSION_KEY))
    monkeypatch.setattr(settings, "cache_dir", str(tmp_path))
    return tmp_path


@pytest.fixture(autouse=True)
def no_network_behind_the_gate(monkeypatch, isolated_cache):
    """
    Hermetic (Block 31, decision of 18 Oct). compute() asks for
    force_refresh, and the real pipeline behind the gate rebuilds the analysis
    from OpenF1's raw endpoints, which the repo does not version: offline the
    test failed after four connection attempts. What this file checks is the
    gate, so everything in front of it stays real (compute(), the FastAPI app,
    the header, require_season_access) and only the build behind it answers
    from the published analysis. Any call to OpenF1 fails the test.
    """
    import json
    from app.api import analysis as route

    published = json.loads((isolated_cache / str(PRO_SESSION_KEY) / "_analysis.json").read_text())
    meta = json.loads((isolated_cache / str(PRO_SESSION_KEY) / "_session_meta.json").read_text())

    async def no_openf1(*args, **kwargs):
        raise AssertionError(f"OpenF1 was called: {args} {kwargs}")

    async def fetch_meta(session_key):
        return meta

    async def build(session_key, session_meta, force_refresh):
        assert force_refresh, "compute() is meant to rebuild, not read the cache"
        return published

    monkeypatch.setattr(route, "fetch_json", no_openf1)
    monkeypatch.setattr(route, "_fetch_session_meta", fetch_meta)
    monkeypatch.setattr(route, "_shared_build", build)


@pytest.fixture
def build_secret_configured(monkeypatch):
    monkeypatch.setattr(settings, "internal_build_secret", SecretStr("e2e-real-secret"))
    return "e2e-real-secret"


def test_compute_gets_past_the_real_gate_when_the_secret_is_set(monkeypatch, build_secret_configured):
    """
    The actual regression, reproduced: real compute(), real FastAPI app, real
    gate — no TestClient mock standing in for either side. This is what
    test_autopublish.py's mocked-TestClient tests could not catch, since they
    replace exactly the object that has to see the header pass through it.
    """
    script = _load_autopublish_script()
    result = asyncio.run(script.compute(PRO_SESSION_KEY))
    assert result["race"]["session_key"] == PRO_SESSION_KEY


def test_compute_is_still_refused_without_the_secret(monkeypatch):
    """
    The other half of the pair: prove the gate is actually being exercised
    here, not skipped for some unrelated reason (free season, missing cache,
    …) that would make the test above pass for the wrong reason.
    """
    monkeypatch.setattr(settings, "internal_build_secret", SecretStr(""))
    script = _load_autopublish_script()
    with pytest.raises(RuntimeError, match="PRO_REQUIRED"):
        asyncio.run(script.compute(PRO_SESSION_KEY))
