"""
CORS for Netlify deploy previews (Block 26d).

Derived from the production Netlify origin already in cors_origins:
https://<site>.netlify.app allows https://<prefix>--<site>.netlify.app and
nothing else. Checked twice — the regex on its own, and through Starlette's
CORSMiddleware, the thing that actually answers the browser.
"""
from __future__ import annotations

import re

import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from app.utils.origins import netlify_preview_origin_regex
from app.main import app as real_app

PRODUCTION = [
    "https://pitwallengineer.com",
    "https://www.pitwallengineer.com",
    "https://pit-wall-f1-project.netlify.app",
]

ALLOWED = [
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
]


@pytest.fixture(scope="module")
def regex() -> str:
    r = netlify_preview_origin_regex(PRODUCTION)
    assert r is not None
    return r


@pytest.mark.parametrize("origin", ALLOWED)
def test_previews_of_the_production_site_match(regex, origin):
    assert re.fullmatch(regex, origin)
    assert re.match(regex, origin)  # anchored either way Starlette calls it


@pytest.mark.parametrize("origin", REFUSED)
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
    assert r and re.match(r, ALLOWED[0])


def preflight(client: TestClient, origin: str):
    return client.options("/health", headers={
        "Origin": origin, "Access-Control-Request-Method": "GET",
    })


@pytest.fixture(scope="module")
def cors_client() -> TestClient:
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


@pytest.mark.parametrize("origin", ALLOWED + PRODUCTION)
def test_the_middleware_answers_previews_and_production(cors_client, origin):
    r = preflight(cors_client, origin)
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == origin
    r = cors_client.get("/health", headers={"Origin": origin})
    assert r.headers.get("access-control-allow-origin") == origin


@pytest.mark.parametrize("origin", REFUSED)
def test_the_middleware_refuses_the_rest(cors_client, origin):
    r = preflight(cors_client, origin)
    assert r.status_code == 400
    assert "access-control-allow-origin" not in r.headers
    r = cors_client.get("/health", headers={"Origin": origin})
    assert "access-control-allow-origin" not in r.headers


def test_the_real_app_wires_the_derived_regex():
    from app.core.config import settings
    cors = [m for m in real_app.user_middleware if m.cls is CORSMiddleware]
    assert len(cors) == 1
    assert cors[0].kwargs["allow_origin_regex"] == netlify_preview_origin_regex(settings.cors_origins)
