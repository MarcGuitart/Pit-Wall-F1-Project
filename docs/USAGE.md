# Platform usage and limits

What each platform allows on the plans in use, what October 2026 cost, and the rule for deploys. Figures marked
**a verificar** were not checked against the provider when this was written.

## Limits

| Platform | Plan | Limit | What spends it |
|---|---|---|---|
| Netlify | free | 300 credits a month; a production deploy costs 15 (so 20 production deploys a month, nothing else counted) | every production deploy of the frontend |
| Render | free (workspace) | 750 instance hours a month for the whole workspace; 500 build minutes; 5 GB outbound bandwidth | each free web service while awake (the API and the live server; they sleep after 15 min without incoming requests and wake on the next one); each build |
| GitHub Actions | public repository | standard runners free; on a private repository (GitHub Free) 2,000 minutes a month | publish-race.yml (hourly cron, `17 * * * *`), precompute-telemetry.yml (daily, `40 4 * * *`), manual backfills |
| Groq | as on the account | requests and tokens per minute and per day for `openai/gpt-oss-120b`: **a verificar** (console.groq.com, Settings, Limits) | every Engineer question: about 3,000 to 4,000 tokens (2,300 to 2,700 in, answer and reasoning out, `max_tokens` 4000) |

Two free web services awake all month would need about 1,488 hours, twice the workspace's 750: the API and the live
server only fit if they sleep most of the time.

## October 2026

| Platform | Spent | Note |
|---|---|---|
| Netlify | all 300 credits by 20 Oct | about 20 production deploys |
| Render | 744 hours by 27 Oct | services kept awake: open tabs polled the live server every minute and every landing visit asked it (fixed in block 51: the live server is asked only from 30 min before a session to its end) |

## What wakes Render without a reader (block 51)

- The frontend, after block 51: the live server only inside a session's window; the API on page loads only (4 to 10
  requests per open tab and hour, measured), the calendar at most once per 6 h per tab.
- The publication Action: it does not call Render, but each commit it makes to main starts a deploy of the API
  (auto-deploy on, from 1 Nov): a build (build minutes) and a fresh, awake instance (hours). That is by design: Render
  has no disk, so a published race reaches the site only through a new image. The Action's commits carry `[skip ci]`,
  which stops GitHub Actions re-triggering on them and stops Netlify building (Netlify honours `[skip ci]`), while
  Render only skips on `[skip render]`, `[render skip]`, `[skip deploy]` or `[skip cd]` (publish-race.yml, its header).
  Expected: **Render deploys on each Action commit, Netlify does not**. Checked on Sunday 1 Nov (see the log below).
  The live server has auto-deploy off from 1 Nov, so these commits never redeploy it.
- Manual checks against production: the QA tools (`tools/lib/common.sh`, `tools/browser/prodshots.mjs`),
  `scripts/stats_snippet.sh` and `scripts/prepublish_check.sh` of the launch video. Each run wakes what it calls.
- Render's own health checks (`healthCheckPath: /health`) run against an awake instance; they do not keep a free
  service from sleeping: **a verificar**.

## The rule

At most **one grouped deploy a week** per platform, plus **2 in reserve a month** for something that cannot wait.
A deploy that would go over is held until the next week. Each deploy is logged below, with its cost.

## Log

| Date | Platform | Commit | Credits or hours | Note |
|---|---|---|---|---|
| | | | | |
