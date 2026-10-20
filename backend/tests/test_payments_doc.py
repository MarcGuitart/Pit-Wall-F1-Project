"""docs/PAYMENTS.md stays in step with the /billing router and .env.example."""
from __future__ import annotations

import re
from pathlib import Path

from app.api.billing import router

ROOT = Path(__file__).resolve().parents[2]
DOC = (ROOT / "docs" / "PAYMENTS.md").read_text()
ENV = (ROOT / "backend" / ".env.example").read_text()
VARS = ["PAYMENTS_ENABLED", "STRIPE_SECRET_KEY", "STRIPE_PRICE_ID", "STRIPE_WEBHOOK_SECRET", "PAYMENTS_RETURN_URL"]


def test_every_billing_route_is_documented():
    for route in router.routes:
        for method in route.methods:
            assert f"`{method} {route.path}" in DOC, f"{method} {route.path}"


def test_every_variable_is_documented_and_in_env_example_without_a_value():
    for var in VARS:
        assert var in DOC
        assert re.search(rf"^{var}=$", ENV, re.M), var


def test_no_key_looking_value_in_the_doc():
    assert not re.search(r"(sk|rk)_(test|live)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}", DOC)
