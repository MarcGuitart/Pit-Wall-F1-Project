/**
 * Subscriptions (block 44) are off unless the site is built with
 * NEXT_PUBLIC_PAYMENTS_ENABLED=1. The flag lives alone so that shared code
 * (the access store, the landing, the race list, the walls) can read it
 * without pulling in any payment code: everything else is imported
 * dynamically, and only when the flag is on, so a build with payments off
 * ships none of it (block 52b, bundle budget).
 */
export const PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === '1'
