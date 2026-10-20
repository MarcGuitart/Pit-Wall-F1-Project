# Payments: PRO by subscription (Stripe, test mode only)

PRO (the 2025 season onwards and Live mode) can be bought as a monthly
subscription, 2.99 EUR a month, through Stripe Checkout. Access codes keep
working exactly as before; a subscription is a second way to get the same
token.

Everything is behind `PAYMENTS_ENABLED` (backend) and
`NEXT_PUBLIC_PAYMENTS_ENABLED` (frontend), both off by default. Off, the
`/billing` routes answer `503 PAYMENTS_DISABLED` and the site keeps saying
"Subscriptions are not open yet".

This is **test mode only**. `app/core/stripe_api.py` refuses any key that does
not start with `sk_test_` or `rk_test_` while `TEST_MODE_ONLY = True`. Taking
real money means changing that line on purpose (see "Before real money").

## How it works

| Route | What it does |
|---|---|
| `POST /billing/checkout` | Creates a Checkout Session (mode subscription, `STRIPE_PRICE_ID`, Terms box required with the withdrawal waiver text) and returns its `url`. Ten per IP per hour. |
| `GET /billing/success?session_id=cs_...` | Asks Stripe for the session with its subscription. Paid and active: answers the PRO token (`v1`, the same HMAC as codes). Idempotent: the token is issued at the session's creation time and expires with the paid period, so reloading answers the same token. |
| `POST /billing/renew` | `Authorization: Bearer <subscription token>`, expired is fine. Stripe says whether the subscription is still `active` or `trialing`; if so, a fresh token until the new period end. |
| `POST /billing/portal` | Same bearer. A Customer Portal session (cancel, change card, invoices) returning to `/settings`. |
| `POST /billing/webhook` | Checks `Stripe-Signature` against `STRIPE_WEBHOOK_SECRET` (5 minute tolerance), logs the event type and ids, stores nothing. |
| `POST /billing/restore` | **Not built yet.** Waits for the owner's choice of email provider. |

A subscription token is the existing token with code id `stripe:<digest>` and a
`sub` claim holding the subscription id. It expires at the end of the paid
period plus 3 days (`GRACE_DAYS`), so a card retry does not lock a reader out
mid weekend. Code tokens cannot renew or open the portal (`409 NOT_A_SUBSCRIPTION`).

## Limitations of having no database

Stripe is the only record of who pays. That keeps the backend stateless and
free of personal data, and costs this:

1. **A lost token can only come back through Restore**, which needs email.
   Until it exists, a reader who clears their browser has to write to the
   owner, who finds them in the Stripe dashboard.
2. **Cancelling does not cut access at once.** A token stays valid until it
   expires (end of the paid period plus 3 days). A refund with immediate
   cancellation also leaves the token working until then. The only way to kill
   one token early is rotating `PRO_TOKEN_SECRET`, which logs out everyone,
   code holders included.
3. **A token can be shared.** Nothing counts devices; whoever holds the token
   has PRO until it expires.
4. **The success URL is a key.** Anyone with `?session_id=cs_...` (browser
   history, a shared link) can fetch a token while the subscription is active.
   Making it single use needs stored state.
5. **Webhooks are only logged.** Render's free tier keeps logs briefly; nothing
   reacts to `customer.subscription.deleted` or failed payments beyond the token
   expiring.
6. **Every renewal and portal visit is a Stripe call.** Far below Stripe's
   limits at this scale, but a Stripe outage blocks renewals (not existing tokens).
7. **Two subscriptions from one person go unnoticed.** Checkout does not know
   who is already paying.

## What to set up in Stripe (test mode)

1. A Stripe account; stay in **Test mode**.
2. A product "Pit Wall Engineer PRO" with a recurring price of 2.99 EUR per
   month. Its id (`price_...`) is `STRIPE_PRICE_ID`.
3. Settings, Public details: a **Terms of service URL**. Checkout refuses
   `consent_collection[terms_of_service]` without one.
4. Settings, Billing, Customer portal: allow cancelling and updating the
   payment method; set the default return URL to the site's `/settings`.
5. Developers, Webhooks: an endpoint at `https://<api>/billing/webhook` for
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_failed`. Its signing
   secret is `STRIPE_WEBHOOK_SECRET`.
6. Developers, API keys: the test secret key (`sk_test_...`) is `STRIPE_SECRET_KEY`.

Environment, never in the repo:

| Where | Variable |
|---|---|
| Render (API) | `PAYMENTS_ENABLED=1`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `PAYMENTS_RETURN_URL` (the site, e.g. `https://pitwallengineer.com`) |
| Netlify (site) | `NEXT_PUBLIC_PAYMENTS_ENABLED=1` (needs a new build) |

## Testing in test mode

Run the API with the variables above, then subscribe from the PRO wall or
Plans. Stripe's test cards (any future date, any CVC, any postcode):

| Card | Result |
|---|---|
| 4242 4242 4242 4242 | paid |
| 4000 0025 0000 3155 | asks for 3D Secure, then paid |
| 4000 0000 0000 9995 | declined (insufficient funds) |
| 4000 0000 0000 0341 | first payment works, later renewals fail |

Webhooks locally: `stripe listen --forward-to localhost:8000/billing/webhook`
prints a `whsec_...` to use as `STRIPE_WEBHOOK_SECRET`; `stripe trigger
customer.subscription.deleted` sends one. To see a renewal or a cancellation at
period end without waiting a month, create the subscription on a Stripe **test
clock** and advance it.

Automated tests (`backend/tests/test_billing.py`) run on a simulated Stripe and
never reach it.

## What the owner decides

1. The email provider for Restore (proposal in the block 44 report).
2. The Terms of service page and its withdrawal waiver wording (the Checkout
   text is in `app/api/billing.py`, `TERMS_TEXT`).
3. Whether to offer a trial (`subscription_data[trial_period_days]`).
4. `GRACE_DAYS` (3) and the token lifetime.
5. When, and whether, to take real money.

## Before real money

1. **VAT.** Digital services sold to EU consumers are taxed at the buyer's
   country rate: register for the EU One Stop Shop, or turn on Stripe Tax, and
   decide whether 2.99 EUR includes VAT.
2. Terms, privacy policy (Stripe processes the payer's data), and a legal
   review of the withdrawal waiver.
3. Restore built and tested, so a paying reader can always get back in.
4. Stripe account activated (business details, bank account), live product and
   price, live webhook endpoint and secret.
5. Set `TEST_MODE_ONLY = False` in `app/core/stripe_api.py`, with a test, in its
   own reviewed commit; then live keys in Render.
