# AdaTwin deck assets: notes

Collected 2026-11-21. All numbers come from a run, a log, a metric or a price page; each one says which. Times are UTC unless marked IST.

## Contents

- `screenshots/` holds 01–11 at 1920x1080, plus `10a-before.png` (1376x774) and `10b-after.png` (2752x1536).
- `bench/` holds `benchmark.json`, `fixed.json` and 6 charts, each as SVG and PNG. There is no `eval.csv` (see "Evaluation").
- `costs.csv` breaks cost down by service; every row is NOT AVAILABLE (see "Costs").
- `unit-costs.csv` gives the cost of one shift, one document read, one image and one world.
- `logo/` has `adatwin-logo.svg` and `.png` (mark and wordmark, transparent) and `adatwin-mark.svg` and `adatwin-mark-1024.png` (mark only, transparent).

## Screenshots

How they were taken:
- Headless Chrome, 1920x1080, light theme, no browser chrome. The profile name is "Plant team", so no email is visible.
- Sample plant: Boiler room.
- 01 is from production (https://ada-twin.web.app).
- 02–11 are from the app running locally against a local database, because the production database (Cloud SQL) is suspended and projects can't open on the live site.
- The local app was the current code, which includes the features deployed to the web on 2026-11-21. Gemini, Nano Banana and World Labs assets were real calls, not mock-ups.

Notes per shot:
- **02-capture:** in this app the walkable 3D world (Gaussian splat, World Labs Marble) is shown on the Twin step's "3D world" view, not on the Capture step. The Capture step shows only the panorama thumbnail. The shot is the world fully loaded with the machine pins Gemini found.
- **03-twin:** the material-flow graph drafted by Gemini, with the machine list open. The pins are in 02 and 11.
- **04-scenario:** "Hot week, full order book", described in plain words. Gemini set demand to 340 batches per shift, the target to ship at least 300, and 34 °C. A second proposal of the same changes is still waiting for Accept.
- **05-agents:** Priya (production planner, aggressive), Marek (maintenance technician, by the book), Sam (shift supervisor, cautious).
- **06-results-live:** 3 h into a live shift: 3D floor, decisions streaming, live charts.
- **07-results-compare:** the crew against standard rules, averaged over 10 simulated days with the worst and best day under each figure. The app has no per-day chart; the day-by-day spread appears as ranges. The 30-day charts are in `bench/`.
- **08-trial:** two picked changes (one more Control panel unit; halve Control panel repair time) run on the redesign copy. Batches shipped rose from 174.2 to 215.3 under standard rules and from 178.9 to 215.3 with the agents.
- **09-new-plant:** the applied changes ranked HIGH and LOW by impact, with Gemini's summary.
  - The summary says "parts" where the plant's unit is "batches". That is the model's wording, shown as is.
- **10:** Nano Banana 2.1 adds a second Control panel to the photo.
  - 10a is the photo as it is.
  - 10b is the drawing the app picked.
- **11-model-picker:** 5 Gemini text models and 4 Nano Banana image models.
- **12-signin:** NOT AVAILABLE. There is no sign-in page in production.

## Benchmark (`pnpm --filter @repo/scripts benchmark`, run 2026-11-20 22:18 UTC = 2026-11-21 03:48 IST)

- **Simulator:**
  - 2.53 ms per 8-hour shift, 76 ms for 30 days.
  - 11,368,421 times faster than real time.
  - Measured in Node on the developer's laptop.
- **Live agent shift on the production API:**
  - start to done 111,323 ms, with the playbook written at 122,334 ms
  - standard-rules days computed on the server in 1,679 ms
- **Gemini decisions:** 30, with 0 fallbacks, so 100% were answered by the agents.
- **Twin fidelity:** 96%. The crew's playbook replayed on the real day predicts the parts the live crew shipped to within 4%.

Parts shipped per shift over 30 days (seeds 1–30, standard rules unless noted):

| Setup | Mean | Min | Max |
|---|---|---|---|
| Standard rules | 242.8 | 186 | 297 |
| Fix: add one more unit to Boilers | 277.7 | 187 | 329 |
| Fix: halve repair time at Boilers | 275.8 | 221 | 301 |
| Fix: add a maintenance crew | 261.8 | 220 | 300 |
| Fix: double the header queue to 12 parts | 242.0 | 195 | 291 |
| Combined: the two best fixes | 304.6 | 261 | 336 |
| AI crew's playbook, no fixes | 235.3 | 171 | 286 |
| AI crew's playbook with the two best fixes | 315.6 | 252 | 354 |

Notes on the table:
- `benchmark.json` stores each fix as a gain over standard rules. The absolute per-fix rows above come from re-running the same simulation, and their means match those gains.
- On this run the crew alone shipped less than standard rules (235.3 vs 242.8). The gain comes from the fixes.
- **Live API latency** from the laptop to Cloud Run in africa-south1:
  - health check: p50 522 ms, p90 1,019 ms
  - database read: p50 1,081 ms, p90 2,283 ms. The database is suspended, so this read returns an error.
- **Chart fix:** `scripts/src/bench-charts.ts` had two hardcoded labels, a "15 ms" per shift and a "~12 min" world build taken from an older deck. They now come from `benchmark.json` (2.53 ms) and from World Labs' own timestamps for the boiler-room world (8 min). This change is uncommitted.

## Evaluation

- `bench/eval.csv`: NOT AVAILABLE. Vertex AI has no evaluation runs for the project and the repo has no evaluation code, so no crew decisions have been scored.

## Timings

- **Gemini flow draft:**
  - 10.1 s from click to graph drawn, measured locally 2026-11-21, 9 nodes and 7 links.
  - 12.8 s model call (13.6 s request) in production, 2026-10-23, from Cloud Logging.
- **3D world build (World Labs generation, from created_at to updated_at, 2026-10-17):**
  - boiler 8 min 15 s
  - foundry 8 min 40 s
  - machine shop 9 min 18 s
  - pump hall 7 min 41 s
  - electrical lab 6 min 49 s
  - the first world: 11 min 44 s (2026-10-12)
- **End-to-end build from a 360° photo** (upload to walkable world, timed in the app): NOT AVAILABLE.
  - No build falls inside the 30 days of logs kept, and none was run for this, because each costs World Labs credits.
  - The World Labs times above cover generation only.
- **Live agent shifts in production** (Cloud Logging, 2026-10-22/23): 82,554 ms (32 decisions), 120,262 ms and 178,406 ms (30 decisions each), all with 0 fallbacks.
- **Locally, 2026-11-21:** Gemini located the 7 machine pins in 40 s.
- **Nano Banana image (2K):** 38.0 s and 43.0 s in production (2026-10-23).
- **One Gemini document read:** 82 s locally (2026-11-21, one-page datasheet).

## Costs

- **By service for the last 30 days** (`costs.csv`): NOT AVAILABLE.
  - The project has no BigQuery billing export, and the Cloud Billing API does not return spend per service.
  - To get it, export it from Console > Billing > Reports for billing account 01A476-8CA0FE-C4E82E.
- **Per item** (`unit-costs.csv`), in USD with INR at 92.9699 (the FBIL rate for 2026-11-20 that the app uses):

| Item | USD | INR |
|---|---|---|
| One agent shift (local app run) | 0.44 | 41 |
| One agent shift (trial run) | 0.45 | 42 |
| One agent shift (benchmark on the live API; upper bound) | 0.26 | 24 |
| One Gemini document read | 0.008 | 0.74 |
| One Nano Banana 2K image | 0.06 | 5.7 |
| One World Labs world | 1.20–2.40 | 112–223 |

How these were obtained:
- **Agent shifts:** Vertex AI token counts per minute (Cloud Monitoring) × the official list price for gemini-3.5-flash (USD 1.50 per 1M input tokens, 9.00 per 1M output and reasoning tokens).
- **Document read and image:** tokens the app logs per call × the official prices. Google also lists a 2K image alone at USD 0.05.
- **World Labs:** the official price page only, not billing.
- **Spend while collecting these assets:** about USD 2 in Gemini tokens (Cloud Monitoring token counts × list price), plus any Google Search grounding fee for the benchmark's web price lookup.
  - 3 agent shifts
  - 4 Nano Banana images; 2 of them were lost because drawings live in the browser
  - 16 machine-location calls
  - 1 document read
  - 1 flow draft
  - scenario and summary calls

Infrastructure:
- **Cloud SQL:** `ada-twin`, tier db-perf-optimized-N-8 (Enterprise Plus, 8 vCPU), PostgreSQL 18, 100 GB, zonal, africa-south1, state SUSPENDED.
- **Cloud Run:** `ada-twin-api` in africa-south1, min instances 0 (none set), max 3, 1 vCPU, 512 MiB, startup CPU boost on.

## Current facts

- **Region:** the API and database are still in africa-south1 (Johannesburg). They have not moved to Mumbai (asia-south1).
- **Sign-in:** not live. There is no sign-in page or provider.
- **Gemini models in production** (Cloud Logging, 2026-10-22 to 2026-11-20): gemini-3.5-flash (the default text model) and gemini-nano-banana-2.1 (the default image model). The picker also offers Gemini 3.8 Flash, 4 Argon, 3.5 Flash-Lite and 3.1 Flash-Lite, plus Nano Banana Pro, 2 and 2 Lite.
- **Agents:** 17 in all.
  - 3 crew roles: planner Priya, technician Marek, supervisor Sam.
  - 14 helpers: floor operator, flow drafter, machine locator, document reader, web researcher, scenario writer, playbook writer, change explainer, cost estimator, cost reader, cost advisor, equipment scout, plant designer, plant illustrator.
  - The cost reader and cost advisor are not on the production API yet.
- **Features since 10 Nov 2026:**
  - Committed (git log, 2026-11-10):
    - Show only the latest run on the results page, promote the trial on apply, and add the status page with its health checks.
    - Remove the landing-lab explorations from the repo.
  - Uncommitted (frontend deployed to ada-twin.web.app; API not deployed while Cloud SQL is suspended):
    - Numbers in AI-written text are checked against the run's figures, and misses are flagged in the UI.
    - Demo document packs for the boiler room (overview, datasheets, stoppage logs, reference sheets, cost sheet) in a Docs tab.
    - Each figure read from a document is checked against the passage it cites, and compared with published ranges.
    - Cost tab: where the shift lost money and agents vs standard rules, in INR or USD, with a checked Gemini brief.
    - Hindi for the app and for what the AI writes.
- **Tests:** `pnpm test` gives 150 of 150 tests passing in 25 files (2026-11-21).
- **Live URL** https://ada-twin.web.app: yes, it loads (HTTP 200). Projects cannot open while Cloud SQL is suspended.
- **Pitch video** https://ada-twin.web.app/media/adatwin-pitch-v2-1080p60.mp4: yes (HTTP 200, 25.6 MB).
