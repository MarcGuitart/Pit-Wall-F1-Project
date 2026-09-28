"""
The one place the product's name lives, for every user-facing message.

Before this: the backend said "Pit Wall IQ" in the 402 message, the FastAPI
title and the live-mode wall, while the site, /docs and every public post said
"Pit Wall Engineer" — three call sites, one hand-typed literal each, free to
drift, and they had (Block 22). One constant, imported everywhere a message
reaches a reader, closes that off structurally: there is no second literal
left to fall out of sync.

This is the public name only — code identifiers (the repo, PyPI-style module
names, env var prefixes) keep whatever they already use and are not meant to
match this string.
"""
from __future__ import annotations

PRODUCT_NAME = "Pit Wall Engineer"
PRO_NAME = f"{PRODUCT_NAME} PRO"
