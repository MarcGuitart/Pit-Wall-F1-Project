# Race telemetry from OpenF1 on Cloudflare R2 (block 36)

The telemetry tab asks R2 first and the API (FastF1) second:

    <NEXT_PUBLIC_TELEMETRY_URL>/telemetry/v1/<session_key>/fastest_clean.json
    <NEXT_PUBLIC_TELEMETRY_URL>/telemetry/v1/<session_key>/representative.json

- **Files:** one per race and lap mode, with the whole field, in the `TelemetryData` shape. They are stored gzip (`Content-Encoding: gzip`) and are 97–145 KB each.
- **Fallback:** a missing file, R2 unreachable, or none of the requested drivers → the API answers, exactly as before. With the variable unset, R2 is never asked.
- **Badge:** the tab names the source: `OpenF1` or `FastF1`, with the method note on hover.

| Piece | Where |
|---|---|
| Builder | `backend/scripts/openf1_telemetry.py` (lengths from `data/circuit_lengths.json`, shared with the Recon Lap) |
| Batches to R2 | `.github/workflows/telemetry-openf1.yml` (by hand: sessions or a season; one batch at a time, 45 OpenF1 requests a minute) |
| Chained | `publish-race.yml` queues the workflow with the sessions it has just committed (races only are built) |
| Index | `telemetry/v1/index.json`, rebuilt from the bucket listing after every run (`backend/scripts/telemetry_index.py`) |
| Before R2 exists | the workflow stops at its plan with a notice, never fails; the site keeps using the API |

## What the owner sets up (once)

### Cloudflare (account that holds pitwallengineer.com, whose DNS is already on Cloudflare)
1. **R2 bucket.** R2 → Create bucket.
   - Name `pitwall-telemetry`, location Automatic, Standard storage class.
2. **Public domain.** Bucket → Settings → Custom Domains → Connect domain.
   - Enter `telemetry.pitwallengineer.com`; Cloudflare adds the DNS record and the certificate.
   - Leave the r2.dev public URL **disabled**: it is rate-limited and not meant for production.
3. **CORS on the bucket.** Bucket → Settings → CORS policy:
   ```json
   [{"AllowedOrigins": ["https://pitwallengineer.com", "https://www.pitwallengineer.com", "http://localhost:3000"],
     "AllowedMethods": ["GET", "HEAD"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 86400}]
   ```
4. **API token, least privilege.** R2 → Manage R2 API Tokens → Create API token.
   - Permission: **Object Read & Write**.
   - Specify bucket: **only `pitwall-telemetry`**.
   - TTL: Forever, or a date to rotate on.
   - Client IP filtering: none (GitHub runners have no fixed IP).
   - Keep the **Access Key ID** and the **Secret Access Key**; the secret is shown once.
   - Also note the **Account ID** (R2 overview, right column).
   - No account-level token and no Admin permission are needed: the workflow only lists, reads and writes objects in that bucket.

### GitHub (MarcGuitart/Pit-Wall-F1-Project → Settings → Secrets and variables → Actions)
| Name | Kind | Value |
|---|---|---|
| `R2_ACCOUNT_ID` | secret | the Account ID |
| `R2_ACCESS_KEY_ID` | secret | the token's Access Key ID |
| `R2_SECRET_ACCESS_KEY` | secret | the token's Secret Access Key |
| `R2_BUCKET` | **variable** | `pitwall-telemetry` |
| `OPENF1_USERNAME`, `OPENF1_PASSWORD` | secret | already there (24 Oct) |

### Netlify
`NEXT_PUBLIC_TELEMETRY_URL` = `https://telemetry.pitwallengineer.com`.

It is read at build time, so it takes effect with the next production deploy. Unset means API only, as today.

## First run (backfill)
Actions → *Telemetry (OpenF1) to R2* → Run workflow, once per season: `season` = 2023, then 2024, then 2026 (races so far).
- A race takes about 100 s, so a season of 24 is about 45 minutes in 4 batches.
- Seasons with data already in R2 are skipped unless `force`.
- Check: `curl -sI https://telemetry.pitwallengineer.com/telemetry/v1/11396/fastest_clean.json` returns `200`, `content-encoding: gzip`, `content-type: application/json`.
- Check: `curl -s https://telemetry.pitwallengineer.com/telemetry/v1/index.json | jq '.sessions | length'` gives the number of races.

## Known differences from the FastF1 telemetry
- **Sampling:** OpenF1 samples at about 3.7 Hz, against FastF1's interpolated 10 Hz or more. Braking g peaks read lower (about −2 g against −3 g).
- **Lateral g:** comes out at 4–5 g, physically right. The FastF1 cache shows about 0.4 g because `telemetry_service._compute_gg` takes FastF1's x/y (decimetres) as metres. That is a separate fix with a cache recompute, not done here.
- **Distances:** scaled to the official lap length, as the note says.
