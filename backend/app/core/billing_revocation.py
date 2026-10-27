"""
Subscriptions cut off before their token expires (block 44, 44b).

There is no database, and on Render's free plan no disk that survives a restart
or a deploy. So the list has two parts, read together on every check:

  PAYMENTS_REVOKED_SUBS   comma-separated subscription ids, set by the owner in the
                          environment ("sub_A,sub_B"). Durable: it survives every
                          restart and deploy. A change needs a restart.
  the runtime list        what the Stripe webhook revoked since this process
                          started (customer.subscription.deleted,
                          invoice.payment_failed), in memory. **Lost on a restart**
                          (a deploy, a crash, or the free service sleeping after 15
                          minutes without requests), so it only shortens the gap.

What a restart loses is harmless by design: a subscription token expires at the
end of the paid period plus GRACE_DAYS, and /billing/renew asks Stripe before
minting a new one, so a cancelled or unpaid subscription is shut out by then
anyway. The runtime list only cuts it off sooner; for a refund, a chargeback or
abuse that must stay cut off, the webhook's notice names the id to add to
PAYMENTS_REVOKED_SUBS.

Standard library only: app.core.access imports this, and the live server imports
app.core.access.
"""
from __future__ import annotations

import os
import threading

ENV = "PAYMENTS_REVOKED_SUBS"

_lock = threading.Lock()
_runtime: dict[str, str] = {}          # subscription id -> reason


def revoked_subscriptions() -> frozenset[str]:
    raw = os.environ.get(ENV, "")
    with _lock:
        runtime = set(_runtime)
    return frozenset(s.strip() for s in raw.split(",") if s.strip()) | runtime


def is_revoked(subscription_id: str) -> bool:
    return subscription_id in revoked_subscriptions()


def revoke(subscription_id: str, reason: str) -> bool:
    """Add to the runtime list. True when it was not there yet."""
    with _lock:
        new = subscription_id not in _runtime
        _runtime[subscription_id] = reason
    return new


def reinstate(subscription_id: str, only_reason: str | None = None) -> bool:
    """Take a runtime revocation back (a failed payment later paid). The environment list is never touched."""
    with _lock:
        if subscription_id in _runtime and (only_reason is None or _runtime[subscription_id] == only_reason):
            del _runtime[subscription_id]
            return True
    return False


def runtime_reason(subscription_id: str) -> str | None:
    with _lock:
        return _runtime.get(subscription_id)


def _reset_runtime_for_tests() -> None:
    with _lock:
        _runtime.clear()
