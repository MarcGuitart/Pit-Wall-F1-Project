"""
CORS origin patterns for the API (app/main.py).

It lives in app/utils/ rather than app/core/config.py on purpose: render.yaml's
recorder build filter admits config.py, and a change here must never restart
the recorder.
"""
from __future__ import annotations

import re
from collections.abc import Iterable


def netlify_preview_origin_regex(origins: Iterable[str]) -> str | None:
    """
    An anchored regex for the deploy previews and branch deploys of every
    Netlify site already allowed: https://<site>.netlify.app in `origins`
    allows https://<prefix>--<site>.netlify.app and nothing else — not another
    site, not a look-alike suffix, never all of netlify.app. The prefix is
    Netlify's (deploy-preview-42, a branch name, a deploy id): lowercase
    letters and digits in single-hyphen groups, so it cannot hide a second
    "--". None when no Netlify origin is allowed (local development).
    """
    sites = []
    for origin in origins:
        m = re.fullmatch(r"https://([a-z0-9]+(?:-[a-z0-9]+)*)\.netlify\.app", origin.strip().rstrip("/"))
        if m:
            sites.append(re.escape(m.group(1)))
    if not sites:
        return None
    return r"^https://[a-z0-9]+(?:-[a-z0-9]+)*--(?:" + "|".join(sorted(set(sites))) + r")\.netlify\.app$"

