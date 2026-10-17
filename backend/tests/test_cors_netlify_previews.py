"""
CORS for Netlify deploy previews — the API and the live server (Blocks 26d, 26e).

One implementation (app/utils/origins.py) and this one matrix of origins, run
against both servers. Derived from the production Netlify origin each server
already allows: https://<site>.netlify.app allows
https://<prefix>--<site>.netlify.app and nothing else. Checked on the regex
itself and through the CORSMiddleware each server actually builds, which is
the thing that answers the browser.
"""
from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from app.main import app as real_app
from app.utils.origins import any_of, netlify_preview_origin_regex

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "scripts"))
if "live_server" in sys.modules:
    live_server = sys.modules["live_server"]
else:
    spec = importlib.util.spec_from_file_location("live_server", BACKEND / "scripts" / "live_server.py")
    live_server = importlib.util.module_from_spec(spec)
    sys.modules["live_server"] = live_server
    spec.loader.exec_module(live_server)

from live_state import RaceState  # noqa: E402

SITE = "https://pit-wall-f1-project.netlify.app"
PRODUCTION = ["https://pitwallengineer.com", "https://www.pitwallengineer.com", SITE]

# ── the matrix ───────────────────────────────────────────────────────────────

PREVIEWS = [
    "https://deploy-preview-42--pit-wall-f1-project.netlify.app",
    "https://ui-migration--pit-wall-f1-project.netlify.app",
    "https://65f1c0ffee12ab--pit-wall-f1-project.netlify.app",
]

REFUSED = [
    # another site on netlify.app
    "https://deploy-preview-42--other-site.netlify.app",
    "https://other-site.netlify.app",
    # look-alike subdomains of the real site
    "https://deploy-preview-42--pit-wall-f1-project-evil.netlify.app",
    "https://deploy-preview-42--evil-pit-wall-f1-project.netlify.app",
    "https://evilpit-wall-f1-project.netlify.app",
    "https://pit-wall-f1-project.netlify.app.evil.com",
    "https://deploy-preview-42--pit-wall-f1-project.netlify.app.evil.com",
    "https://deploy-preview-42--pit-wall-f1-project.netlify.app:8443",
    "https://deploy-preview-42--pit-wall-f1-projectXnetlify.app",
    # a second "--" smuggled in the prefix
    "https://a--b--pit-wall-f1-project.netlify.app",
    # wrong scheme, empty or odd prefixes
    "http://deploy-preview-42--pit-wall-f1-project.netlify.app",
    "https://--pit-wall-f1-project.netlify.app",
    "https://-x--pit-wall-f1-project.netlify.app",
    "https://Deploy-Preview-42--pit-wall-f1-project.netlify.app",
    "https://x.y--pit-wall-f1-project.netlify.app",
    "https://netlify.app",
    # the local-dev allowance stays exactly what it was
    "http://localhost.evil.com",
    "http://127.0.0.1.evil.com",
    "https://localhost:3000",
]

# Origins each server allowed before previews existed; they must still pass.
ALREADY_ALLOWED = {
    "api": PRODUCTION,
    "live": PRODUCTION + ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3001", "http://localhost"],
}


# ── the regex on its own ─────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def regex() -> str:
    r = netlify_preview_origin_regex(PRODUCTION)
    assert r is not None
    return r


@pytest.mark.parametrize("origin", PREVIEWS)
def test_previews_of_the_production_site_match(regex, origin):
    assert re.fullmatch(regex, origin)
    assert re.match(regex, origin)  # anchored however it is called


@pytest.mark.parametrize("origin", [o for o in REFUSED if "netlify" in o])
def test_anything_else_does_not(regex, origin):
    assert not re.match(regex, origin)
    assert not re.fullmatch(regex, origin)


def test_no_netlify_origin_means_no_regex():
    assert netlify_preview_origin_regex(["http://localhost:3000", "https://pitwallengineer.com"]) is None
    assert netlify_preview_origin_regex([]) is None


def test_never_a_wildcard_over_netlify_app():
    """A bare netlify.app or a pattern-looking entry derives nothing."""
    assert netlify_preview_origin_regex(["https://netlify.app"]) is None
    assert netlify_preview_origin_regex(["https://*.netlify.app"]) is None
    assert netlify_preview_origin_regex(["https://.*.netlify.app"]) is None


def test_trailing_slash_and_whitespace_in_env_are_tolerated():
    r = netlify_preview_origin_regex([" https://pit-wall-f1-project.netlify.app/ "])
    assert r and re.match(r, PREVIEWS[0])


def test_any_of_keeps_each_pattern_whole():
    assert any_of(None, None) is None
    assert any_of("a", None) == "(?:a)"
    combined = any_of(r"http://x(:\d+)?", netlify_preview_origin_regex([SITE]))
    assert re.fullmatch(combined, "http://x:1") and re.fullmatch(combined, PREVIEWS[0])
    assert not re.fullmatch(combined, "http://x:1" + PREVIEWS[0])


# ── through each server's middleware ─────────────────────────────────────────

def api_client() -> TestClient:
    """The API's CORSMiddleware, configured exactly as app/main.py does."""
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=PRODUCTION,
        allow_origin_regex=netlify_preview_origin_regex(PRODUCTION),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return TestClient(app)


def live_client(monkeypatch) -> TestClient:
    """The live server's real build_app, with the Netlify site in
    LIVE_ALLOWED_ORIGINS as production sets it."""
    allowed = live_server.PRODUCTION_ORIGINS + (SITE,)
    monkeypatch.setattr(live_server, "ALLOWED_ORIGINS", allowed)
    return TestClient(live_server.build_app(RaceState(session_key=11377), live_server.Hub(), None))


@pytest.fixture(params=["api", "live"])
def server(request, monkeypatch):
    client = api_client() if request.param == "api" else live_client(monkeypatch)
    return request.param, client


def preflight(client: TestClient, origin: str):
    return client.options("/health", headers={"Origin": origin, "Access-Control-Request-Method": "GET"})


@pytest.mark.parametrize("origin", PREVIEWS)
def test_both_servers_answer_previews(server, origin):
    _, client = server
    r = preflight(client, origin)
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == origin
    assert client.get("/health", headers={"Origin": origin}).headers.get("access-control-allow-origin") == origin


@pytest.mark.parametrize("origin", REFUSED)
def test_both_servers_refuse_the_rest(server, origin):
    _, client = server
    r = preflight(client, origin)
    assert r.status_code == 400
    assert "access-control-allow-origin" not in r.headers
    assert "access-control-allow-origin" not in client.get("/health", headers={"Origin": origin}).headers


def test_origins_already_allowed_still_are(server):
    name, client = server
    for origin in ALREADY_ALLOWED[name]:
        r = preflight(client, origin)
        assert r.status_code == 200, (name, origin)
        assert r.headers.get("access-control-allow-origin") == origin, (name, origin)


def test_live_without_a_netlify_origin_is_unchanged(monkeypatch):
    """No Netlify site configured: the regex is the old local-dev one, alone."""
    monkeypatch.setattr(live_server, "ALLOWED_ORIGINS", live_server.PRODUCTION_ORIGINS)
    assert live_server.origin_regex(live_server.PRODUCTION_ORIGINS) == f"(?:{live_server.LOCAL_ORIGIN_RE})"
    client = TestClient(live_server.build_app(RaceState(session_key=11377), live_server.Hub(), None))
    assert preflight(client, PREVIEWS[0]).status_code == 400
    assert preflight(client, "http://localhost:3000").status_code == 200


def test_the_real_api_wires_the_shared_function():
    from app.core.config import settings
    cors = [m for m in real_app.user_middleware if m.cls is CORSMiddleware]
    assert len(cors) == 1
    assert cors[0].kwargs["allow_origin_regex"] == netlify_preview_origin_regex(settings.cors_origins)
