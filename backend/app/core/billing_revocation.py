"""
Subscriptions the owner has cut off by hand (block 44).

Without a database, a subscription token stays valid until it expires. For a
refund, a chargeback or abuse, the owner lists the subscription ids in
PAYMENTS_REVOKED_SUBS (comma-separated, e.g. "sub_A,sub_B") and restarts the
service: every token for those subscriptions stops verifying at once, and
/billing/renew will not mint new ones.

Read on every check, not cached, so a test or a hot env reload sees the
current list. Standard library only: app.core.access imports this, and the
live server imports app.core.access.
"""
from __future__ import annotations

import os

ENV = "PAYMENTS_REVOKED_SUBS"


def revoked_subscriptions() -> frozenset[str]:
    raw = os.environ.get(ENV, "")
    return frozenset(s.strip() for s in raw.split(",") if s.strip())


def is_revoked(subscription_id: str) -> bool:
    return subscription_id in revoked_subscriptions()
