# Payments: PRO by subscription (Stripe, test mode only)

PRO (the 2025 season onwards and Live mode) can be bought as a monthly
subscription, 2.99 EUR a month, through Stripe Checkout. Access codes keep
working exactly as before; a subscription is a second way to get the same
token.

Everything is behind `PAYMENTS_ENABLED` (backend) and
`NEXT_PUBLIC_PAYMENTS_ENABLED` (frontend), both off by default. Off, the
`/billing` routes answer `503 PAYMENTS_DISABLED` and the PRO walls say
"Subscriptions open soon" next to the access code field.

This is **test mode only**. `app/core/stripe_api.py` refuses any key that does
not start with `sk_test_` or `rk_test_` while `TEST_MODE_ONLY = True`. Taking
real money means changing that line on purpose (see "Going live").

## How it works

| Route | What it does |
|---|---|
| `POST /billing/checkout` | Creates a Checkout Session (mode subscription, `STRIPE_PRICE_ID`, Terms box required with the withdrawal waiver text) and returns its `url`. Ten per IP per hour. |
| `GET /billing/success?session_id=cs_...` | Asks Stripe for the session with its subscription. Paid and active: answers the PRO token (`v1`, the same HMAC as codes) and, when the PRO channel is set up, `telegram_invite`, a single-use link valid 24 h (a new one on every call; unused ones expire). |
| `POST /billing/renew` | `Authorization: Bearer <subscription token>`, expired is fine. Stripe says whether the subscription is still `active` or `trialing`; if so, a fresh token until the new period end. |
| `POST /billing/portal` | Same bearer. A Customer Portal session (cancel, change card, invoices) returning to `/settings`. |
| `POST /billing/webhook` | Checks `Stripe-Signature` against `STRIPE_WEBHOOK_SECRET` (5 minute tolerance). `customer.subscription.deleted` and `invoice.payment_failed` revoke the subscription at once (runtime list); `customer.subscription.updated` back to `active` takes a `payment_failed` revocation back; a deletion also removes the member from the PRO channel when known. Everything else is logged. |
| `POST /billing/restore` | `{email}`. Always the same answer, sent before anything is looked up. Afterwards: Stripe customers with that email, their subscriptions, and for the first active one a link to `/billing/restore?token=...` by email (Resend), valid 15 minutes. Five per IP and three per email an hour; over that, the same answer and no lookup. |
| `POST /billing/restore/redeem` | `{token}` from that link: checked (signature, 15 minutes), then Stripe (active, not revoked); answers a PRO token like `/billing/success`. |
| `POST /billing/telegram/webhook` | Telegram's updates for the bot (`X-Telegram-Bot-Api-Secret-Token` must match `TELEGRAM_WEBHOOK_SECRET`). A join to the PRO channel through an invite named after a subscription writes the member's Telegram id into that subscription's Stripe metadata (`telegram_user_id`). |

A subscription token is the existing token with code id `stripe:<digest>` and a
`sub` claim holding the subscription id. It expires at the end of the paid
period plus 3 days (`GRACE_DAYS`), so a card retry does not lock a reader out
mid weekend. Code tokens cannot renew or open the portal (`409 NOT_A_SUBSCRIPTION`).

## When the open week ends

While `OPEN_ACCESS_UNTIL` is in the future everything is open. When it passes,
the PRO walls come back and never end in a dead end:

| Payments | What a PRO wall shows |
|---|---|
| on (`NEXT_PUBLIC_PAYMENTS_ENABLED=1`) | Subscribe (2.99 EUR a month), the access code field, and "Restore access" |
| off | "Subscriptions open soon", the access code field |

## Limitations of having no database

Stripe is the only record of who pays. That keeps the backend stateless and
free of personal data, and costs this:

1. **A lost token comes back through Restore**, by the email used to pay. A
   reader who no longer has that inbox has to write to the owner.
2. **Revocation in memory is lost on a restart.** The webhook's revocations
   live in the running process; a deploy, a crash, or the free service sleeping
   after 15 minutes without requests forgets them. That is harmless by design: a
   subscription token ends with the paid period plus 3 days and `/billing/renew`
   asks Stripe first, so the runtime list only cuts access sooner. For a cut that
   must last, the id goes in `PAYMENTS_REVOKED_SUBS` (next section). Storing the
   list in a versioned file would need a commit from the running API (it cannot
   write to the repo) and a disk on Render (the free plan has none).
3. **A token can be shared.** Nothing counts devices; whoever holds the token
   has PRO until it expires.
4. **The success URL is a key.** Anyone with `?session_id=cs_...` (browser
   history, a shared link) can fetch a token while the subscription is active.
5. **Every renewal and portal visit is a Stripe call.** A Stripe outage blocks
   renewals, not existing tokens.
6. **Two subscriptions from one person go unnoticed.**
7. **The PRO channel only removes members it can trace.** The trace is written
   when someone joins through their own invite; a member who joined before the
   trace existed, through another link, or who was added by hand cannot be
   removed automatically. The owner removes them in Telegram.

## Revoking a subscription by hand

For a refund, a chargeback or abuse: add the subscription id (`sub_...`, from
the Stripe dashboard or the webhook's log line) to `PAYMENTS_REVOKED_SUBS` on
Render, comma-separated, and let the service restart. From then on every token
for that subscription stops verifying, `/billing/renew`, `/billing/portal` and
`/billing/restore/redeem` refuse it, and `/billing/success` answers
`403 SUBSCRIPTION_REVOKED`. Code tokens and other subscriptions are not
affected. Rotating `PRO_TOKEN_SECRET` remains the way to end every token at once.

## Email for Restore (Resend)

1. resend.com: add the domain `pitwallengineer.com` (region EU), create an API
   key with "Sending access" only: `RESEND_API_KEY`.
2. DNS of `pitwallengineer.com`: the records Resend lists for the domain. Copy
   the exact values from Resend, Domains; they have this shape:

| Type | Name | Value | Purpose |
|---|---|---|---|
| TXT | `resend._domainkey` | `p=MIGfMA0GCSq...` (the domain's public key, from Resend) | DKIM |
| MX | `send` | `feedback-smtp.eu-west-1.amazonses.com`, priority 10 | bounces (return path) |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | SPF for the return path |
| TXT | `_dmarc` | `v=DMARC1; p=none;` | DMARC (optional, recommended) |

   The SPF record goes on `send.pitwallengineer.com`, not the root, so it does
   not clash with any SPF the root domain already has.
3. When Resend shows the domain as Verified: `RESEND_FROM` =
   `Pit Wall Engineer <access@pitwallengineer.com>`.

## The PRO channel (Telegram)

1. A private channel; add the bot as an administrator with "Invite users via
   link" and "Ban users". Its id (`-100...`): `TELEGRAM_PRO_CHAT_ID`.
2. The bot: `TELEGRAM_BOT_TOKEN` (the publication Action's bot can be reused).
3. A random string for `TELEGRAM_WEBHOOK_SECRET`, then, once the API is
   deployed, register the webhook:
   `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<api>/billing/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>&allowed_updates=["chat_member"]`
4. GitHub: the secret `TELEGRAM_PRO_CHAT_ID`, so the publication Action posts
   new races there (publications only; internal notices stay in the owner's chat).

## Activation checklist

### Test mode (now)
1. Stripe in Test mode: `~/pw-work/stripe/setup_test.sh` creates the product
   "Pit Wall Engineer PRO", its price (2.99 EUR a month, recurring), sets the
   default Customer Portal (update payment method, invoices, cancel at the end of
   the period, Terms and Privacy URLs, return to `/settings`) and the webhook
   endpoint `https://<api>/billing/webhook` for `checkout.session.completed`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.payment_failed`. It prints the price, portal and webhook ids.
2. Stripe, Settings, Public details: the Terms of service URL
   (`https://pitwallengineer.com/terms`).
3. The webhook's signing secret: Dashboard, Developers, Webhooks, the endpoint,
   Signing secret, Reveal: `STRIPE_WEBHOOK_SECRET`.
4. Resend and Telegram as above.
5. Environment, never in the repo:

| Where | Variable |
|---|---|
| Render (API) | `PAYMENTS_ENABLED=1`, `STRIPE_SECRET_KEY` (test), `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `PAYMENTS_RETURN_URL` (`https://pitwallengineer.com`), `PAYMENTS_REVOKED_SUBS` (empty unless revoking), `RESEND_API_KEY`, `RESEND_FROM`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_PRO_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET` |
| Netlify (site) | `NEXT_PUBLIC_PAYMENTS_ENABLED=1` (needs a new build: one deploy) |
| GitHub (Actions) | `TELEGRAM_PRO_CHAT_ID` |

6. Test with the cards below, Restore with a real inbox, the channel with a
   second Telegram account.

### Going live (in this order)
1. The legal pages filled in (`/terms`, `/privacy`, `/refunds`: every `{{...}}`
   gap decided by the owner), VAT decided (EU One Stop Shop or Stripe Tax, and
   whether 2.99 EUR includes it).
2. Stripe account activated (business details, bank account).
3. In live mode: the product and price again, the Customer Portal again, a live
   webhook endpoint (its own signing secret).
4. `TEST_MODE_ONLY = False` in `app/core/stripe_api.py`, with a test, in its own
   reviewed commit; deployed.
5. Render: the live `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`,
   `STRIPE_WEBHOOK_SECRET`, all at once, then restart.
6. One real subscription by the owner, cancelled from the portal, to see the
   whole path, and a refund from the dashboard.

## Testing in test mode

Stripe's test cards (any future date, any CVC, any postcode):

| Card | Result |
|---|---|
| 4242 4242 4242 4242 | paid |
| 4000 0025 0000 3155 | asks for 3D Secure, then paid |
| 4000 0000 0000 9995 | declined (insufficient funds) |
| 4000 0000 0000 0341 | first payment works, later renewals fail |

Webhooks locally: `stripe listen --forward-to localhost:8000/billing/webhook`
prints a signing secret to use as `STRIPE_WEBHOOK_SECRET`; `stripe trigger
customer.subscription.deleted` sends one. To see a renewal or a cancellation at
period end without waiting a month, create the subscription on a Stripe **test
clock** and advance it.

Automated tests (`backend/tests/test_billing*.py`, `test_notify_telegram.py`)
run on a simulated Stripe, Resend and Telegram and never reach them.

## What the owner decides

1. The legal texts (every `{{...}}` gap in Terms, Privacy and Refunds).
2. Whether to offer a trial (`subscription_data[trial_period_days]`).
3. `GRACE_DAYS` (3) and the token lifetime.
4. When, and whether, to take real money.
