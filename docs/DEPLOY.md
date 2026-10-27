# Deploying — budget, checklist, order

Two hosts, deployed separately: **Netlify** serves the frontend (`frontend/`,
configured by `netlify.toml` at the root) and **Render** runs the backend
services (`backend/render.yaml`). Both deploy automatically on a push to `main`.
That is the whole problem this page exists for: a push is a deploy, and Netlify
deploys are rationed.

No secrets here. Environment variables live in each host's dashboard.

Credit rules checked against Netlify's docs on 16 October 2026:
[How credits work](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/),
[Monitor usage](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/monitor-usage-for-credit-based-plans/),
[Ignore builds](https://docs.netlify.com/build/configure-builds/ignore-builds/).

---

## Budget

| | |
|---|---|
| Netlify Free plan | **300 credits / month**, hard limit, no top-up on Free |
| One successful production deploy | **15 credits** → 300 credits ≈ **20 deploys** |
| Deploy Previews, branch deploys | 0 credits |
| Failed deploys, rollbacks to an earlier deploy | 0 credits |
| **Target** | **at most 6 production deploys a month** (90 credits) |

Six, not twenty, because deploys are not the only meter: bandwidth, web
requests and compute draw on the same 300. And running out is not a slowdown:
when the balance hits zero **every site on the team is paused** and shows
"Site not available" until the next billing cycle. Credits do not roll over.

A rollback costs nothing, so a bad deploy is fixed by rolling back first and
deploying the fix in the next batch, not by deploying twice in an hour.

### What spends a deploy

- **A push to `main` that changes `frontend/`** since the last commit Netlify
  built. Anything else is skipped by the `ignore` command in `netlify.toml`,
  which matters
  because the publication Action (`.github/workflows/publish-race.yml`) commits
  `backend/cache/` to `main` every hour. Those commits redeploy the analysis API
  on Render, which is what publishes a race, and no longer touch Netlify.
- A push builds its last commit, so ten commits merged in one push are one
  deploy. Ten pushes are ten.
- The comparison is with the last commit Netlify **built**
  (`CACHED_COMMIT_REF`, "the last commit that we built before the current
  build"), not the last one it looked at. A frontend change that was skipped
  (`[skip netlify]`, or never built) is still pending, and the next push that
  is not skipped builds it, whatever that push touches. On 18 October the last
  production build is `7f776a6`; `1f6d73b` (frontend) was refused for credits,
  so the first push to `main` that Netlify processes will build.
- `netlify.toml` itself is not in the `ignore` pathspec. **A push that only
  changes `netlify.toml` does not trigger a build**: it shows in the Deploys
  list as a canceled build, and that is intended, not a fault. The change
  takes effect with the next site build; to apply it at once use **Deploys →
  Trigger deploy → Clear cache and deploy site** (15 credits).
- Netlify's docs do not say whether a build skipped by `ignore` costs credits.
  It ends without deploying, and only successful deploys are charged, so it
  should cost 0. Confirm it once in *Account usage insights* (below) after the
  first hourly publication.

### Render

Render does not spend Netlify credits. Each service in `backend/render.yaml`
has a `buildFilter`, so a push redeploys only the services whose files changed.
`[skip render]` in a commit message skips the Render autodeploy. Never put it
on the publication Action's commits: on Render the cache is baked into the
image, so that deploy is how a race goes live. Filters apply to autodeploys
only. A manual deploy, or any change to `render.yaml`, deploys everything.

---

## Before a deploy

Work accumulates on a branch. It reaches `main` in one push, when this
checklist is done:

- [ ] **A significant batch.** Never one small change on its own. The only
      exception is a production failure: a hotfix goes alone, after a rollback
      if one is possible.
- [ ] **The list of what goes out**, written down before pushing:
      `git log --oneline origin/main..HEAD` and
      `git diff --stat origin/main..HEAD`, read through by hand. Note anything
      under `backend/` and which Render services its paths reach.
- [ ] **The preflight gate is green** on the release candidate:
      `tools/preflight.sh --full --strict --candidate oct27` ends with
      `0 fail`. It runs the frontend and backend tests, the production build
      and the browser checks; see [Preflight](#preflight) below. Anything it
      reports as KNOWN was accepted on purpose (`--accept-known`) and is listed
      in the report.
- [ ] **Not during a live session**, if the batch reaches `pit-wall-live` or
      `pit-wall-recorder`. A recorder deploy drops the subscription, and that
      part of the capture is lost.
- [ ] **Log the deploy** in the table at the end of this file.

## Preflight

Everything that can be checked before a deploy, locally, with zero calls to
OpenF1. It lives in `tools/` on the `qa/preflight` branch until that branch is
merged; run it from a checkout of `qa/preflight`.

### Running it

| Command | What it runs | Time |
|---|---|---|
| `tools/preflight.sh --quick` | types, unit tests, build, hygiene, deploy filters, API contract, golden outputs | ~2 min |
| `tools/preflight.sh --full` | the above plus the backend suite, the live replay, bundle size, and the browser checks (smoke, visual, geometry, perf, live, content, /race latency) | ~35 min |
| `--strict` | FLAKY (passed only on retry) and a mandatory SKIPPED count as FAIL | |
| `--candidate oct27` | builds the release candidate first: remote `main` plus the branches in `tools/candidates.json`, merged in one throwaway worktree (`~/pw-work/candidates/current`), deleted at the end | |
| `--keep` | keeps that worktree | |
| `--accept-known` | under `--strict`, accepts the decided findings in `tools/known.json`; without it they fail | |
| `--only build,hygiene` | just those checks; `--list` shows them all | |
| `--update-baseline` | accepts the current screenshots and budgets as the new reference | |
| `--online` | allows OpenF1 calls (off by default) | |

The run keeps the Mac awake (`caffeinate -i`). The perf check refuses to time
anything on a busy machine and says which process is busy (SKIPPED); run it
again when the machine is quiet.

`tools/dev.sh` starts the same local stack for a person instead of a check:
API, live replay (if `PW_LIVE_CAPTURE` points at a capture) and the frontend,
with OpenF1 unreachable and a one-off PRO code printed at start.
`--root <dir>` runs another checkout (a candidate), `--hot` uses `next dev`,
`--online` lets OpenF1 through. Ctrl+C stops everything it started.

### The gate

**`tools/preflight.sh --full --strict --candidate oct27` with 0 fail.** A
deploy does not go out on a red or a FLAKY run.

### Reading the report

- The table printed at the end, and `tools/report/index.html`: one row per
  check, its status, time and reason, and links to its log and reports.
- `tools/report/summary.json`: the same, for scripts, plus the accepted known
  findings.
- `tools/report/logs/<YYYYmmdd-HHMMSS>/`: one directory per run, never
  overwritten. `<check>.log` is the check's output; `<check>.try1.log` is the
  first attempt of a check that was retried; `stack/` holds the local
  servers' logs.
- `tools/report/artifacts/`: the visual diff (`visual/report.html`) and other
  reports.

Statuses: PASS; FAIL; SKIPPED (could not run, with the reason; mandatory
ones fail under `--strict`); FLAKY (failed, then passed on retry; fails under
`--strict`).

### A draft deploy, measured

Checks against the real runtime (Netlify functions, the production API) that
the local stack cannot give:

1. From the release branch, with the production `NEXT_PUBLIC_*` values set in
   the shell: `netlify deploy --build` (no `--prod`). It prints a draft URL.
2. `PF_BASE_API=<production API URL> tools/preflight.sh --base <draft URL>`
   runs smoke, geometry, perf (hard ceilings only) and the /race latency
   against it. PRO steps run only if `PF_BASE_PRO_CODE` is set in the shell;
   it is never written anywhere.
3. `node tools/browser/navlatency.mjs --base <URL> --no-browser` measures the
   first and warm requests of `/race/<k>` with plain GETs (no API calls): a
   first request several times slower than the warm ones is a cold function.

What a draft deploy costs in credits, and whether a validated draft can be
published as is, are not assumed here: check Netlify's docs and *Account usage
insights* before relying on either.

## Order: Netlify and Render separately

Deploy one host, check it, then deploy the other. Never both in the same
minute without knowing which one broke.

| The batch changes… | Order |
|---|---|
| frontend only | Netlify only. Render's filters skip it. |
| backend only | Render only. Netlify's `ignore` skips it. |
| backend adds something the frontend will use (new endpoint, new field) | **Render first.** Wait for the service to show *Live* and `/health` to answer, check the new field in a real response, **then** Netlify. The old frontend ignores fields it does not know, so this window is safe. |
| frontend stops using something the backend will remove | **Netlify first**, then Render. The reverse order breaks the live site in between. |
| a breaking change on both sides | Split it into the two rows above, in two batches. If it cannot be split, deploy Render, then Netlify straight away, and accept a few minutes of mismatch, outside any live session. |
| `render.yaml` | Deploys every Render service regardless of filters. Treat it as touching recorder and live (see the live-session rule). |

A push to `main` triggers both hosts at once. To get the order above, push the
backend part first, wait, then push the frontend part. Alternatively, turn off
auto-deploy on one side for that push.

---

## What spent the credits

In the Netlify team dashboard (Owner, Billing Admin or Developer role):

- **Usage & billing**: credits left this cycle, at the top.
- **Usage & billing → Credit balance**: the ledger of grants and expiry dates.
- **Usage & billing → Credit usage breakdown**: usage split by feature
  (production deploys, bandwidth, web requests, compute…).
- **Usage & billing → Account usage insights → Credits**: day by day, per meter.
  This is where to look when the balance moves unexpectedly.

The panel has no per-deploy charge list. To attribute a jump in the
*Production deploys* meter, match its day against the site's **Deploys** list,
filtered to production. Builds skipped by `ignore` show up there as canceled,
with the reason in the log. Netlify emails at 50 %, 75 % and 100 % of the
balance (some pages also list 90 %). Treat the 50 % email in the first half of
a month as a problem.

On Render: open the service, then **Events**. It lists every deploy, including
deploys skipped by a skip phrase, and the commit that triggered each one.

---

## Deploy log

One row per production deploy. Keep the month's count visible.

| Date | Commit | Netlify | Render services | Why |
|---|---|---|---|---|
| | | | | |
