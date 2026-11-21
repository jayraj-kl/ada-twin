# Demo document packs and verified citations

Agreed 2026-11-20. The boiler room is built first, end to end; the other four sample plants follow once it has been reviewed in the app.

## Goal

Every figure an agent drafts for a demo plant cites a passage in a specific document, and the app shows whether that citation holds. Cost claims will later use the same mechanism without rework.

Today, sample machines have no documents, so their figures are hard-coded fallbacks (cycle 120 s, MTBF 4 h, MTTR 20 min) marked **Assumed**. `docs/validation/` shows that no published source supports them. The document-reader returns a value and a page, but no quote, so nothing it reports can be checked.

## Decisions

### The packs

1. **Each demo world ships a document pack.**
   - **Per plant:** an overview that defines the unit of work.
   - **Per station:** three documents.
     - A **reference sheet**: published MTBF, MTTR and availability for its equipment class, each footnoted to its real source.
     - A **demo OEM datasheet**: cycle time, its variation, scrap rate and model.
     - A **demo stoppage log**: the work orders, ending in a stated summary.
   - **Per auxiliary machine:** the reference sheet and the stoppage log only.
2. **Reference sheets use only Verified figures** from `docs/validation/`. Those notes stay the team's analysis and source material. They are never shown to users as plant documents and never fed to agents.
3. **The demo plants are a worn fleet.** Figures differ per machine and are chosen so each plant keeps its story: the same bottleneck, and failure-driven changes still worth making. Demo results change from today's, so the pitch video no longer matches number for number.
4. **Labels.**
   - Every made-up document says "Demo document: fictional plant" on every page and carries a "Demo" tag in the UI.
   - Reference sheets say "Reference: figures from published sources" and list their sources.
5. **Format.**
   - Documents are written in markdown in `docs/demo-packs/<world>/`.
   - `scripts/src/demo-packs.ts` renders them to PDF, with numbered pages, using the Playwright Chromium already installed.
   - The PDFs and a `pack.json` manifest are committed under `apps/frontend/public/worlds/<world>/docs/`, so builds never need a browser.
   - The stoppage logs are generated from a seeded script, so their summaries are exact.
6. **Who writes the packs.** Claude drafts them and the user reviews each plant's pack before its agent run is recorded.

**Deviation from the interview: log window.** The logs cover **4 weeks** (20 shifts), not 6–12 months. At worn-fleet MTBFs of a few hours, a year of stoppages would be thousands of rows per machine. Four weeks gives 30–100 rows, which still reads like a real log.

### Claims and verification

7. **Document kinds.** Every document has a kind: `overview`, `plant-record`, `datasheet` or `reference`.
   - Pack documents declare their kind in `pack.json`.
   - For a user's upload, the document-reader guesses the kind and the twin step shows the guess. The user can change it, and the choice is kept on the machine's kept-document entry.
8. **Precedence.**
   - A figure's value comes from a plant record first, then a datasheet, then the web, then an assumption.
   - A reference sheet is never used as a value. It supplies the class **baseline** shown next to the value.
   - This mirrors reliability practice, where site data outranks generic data.
9. **Quotes.** The document-reader returns a quote with every figure and baseline. `doc` provenance gains `quote` and `kind`.
10. **What "verified" means.** A claim is verified when all four hold:
    1. the cited document is among the machine's documents,
    2. the cited page exists,
    3. the quoted passage is on that page (whitespace, case and dash style ignored), and
    4. the value, converted to the passage's units (s, min or h; share or %), is written in the passage.

    The check runs on the server, extracting each page's text with `pdfjs-dist`, for demo and user documents alike. The outcomes are:
    - `verified`
    - `failed`, with the reason
    - `unverifiable`: no text layer, or the file could not be read
11. **Baselines and the range check.** A baseline carries its low–high range, unit and **time basis** (calendar or operating hours), with its own citation.
    - MTBF and MTTR are compared with it as *within range*, *outside range* or *not yet comparable* (no baseline).
    - A calendar-basis MTBF range is widened to run from *low × duty* up to *high*. Duty = scenario shift hours × 5 days × 52 weeks / 8,760 h.
12. **Tests.** A root test recomputes every log summary from its rows and re-verifies every recorded citation against the committed PDFs, so a broken pack cannot ship.
13. **Cost is ready to plug in.** No price documents yet. The verifier takes generic claims (value, unit or currency, document, page, quote), so price lists and quotes can be added later without changing it.

### The demo flow

14. **Opening a sample uploads its pack.** The PDFs go into the new project as machine documents, the same path a user upload takes, with each kept entry carrying its kind and a demo flag. The overview is kept with no machine.
15. **Recorded figures.** Figures, baselines and citations come from one recorded agent run (`scripts/src/record-demo-figures.ts`), stored in the sample seed (`apps/frontend/src/twin/sample-figures/<world>.json`).
    - Every visit to the twin step re-checks those citations live.
    - "Find its parameters" is enabled for samples, because they now have documents, so the agent can be watched drafting.
16. **Twin step.** Each figure's Doc tag opens its citation: document, kind, page, quoted passage, the verifier's result and the class baseline with its status. A link opens the PDF at that page.
17. **Results step, demo worlds only.** A "Documents behind this sim" section lists the pack per machine, what each document supplied, and its labels.

### Boundaries

18. **Ground truth is read-only to agents.** Agents never write ground truth. Only people edit the packs and the notes.
19. **Web figures.** Web-researched figures show "cited, not verified". Checking them is a follow-up spec.
20. **Rollout.** The boiler room first, then foundry, machine shop, pump hall and electrical lab on the same pipeline.

## Boiler room pack

Unit of work: a **500 L batch of treated feedwater raised to steam**, as the overview defines it. The stoppage logs cover 5 Oct to 30 Oct 2026. Their summaries are what the figures cite.

| Machine | Count | Cycle (s) | Variation | Scrap | MTBF (log) | MTTR (log) | Reference baseline (S1, calendar h) |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| Feed pumps | 2 | 70 | 0.20 | 0.5% | 6.1 h | 25.5 min | MTBF 1,166,025–2,076,992; MTTR 5.67–7.40 (B-9) |
| Boilers | 2 | 170 | 0.25 | 1% | 3.1 h | 40.1 min | MTBF 26,659.1–117,277.7; MTTR 44.63–49.20 (B-2) |
| Control panel | 1 | 120 | 0.30 | 2% | 4.3 h | 34.7 min | MTBF 10,345.28–1,647,876; MTTR 1.27–3.68 (B-5, B-9) |
| Gas valve trains (aux) | 2 | – | – | – | 8.8 h | 35.1 min | MTBF 885,794–1,829,941; MTTR 3.00–18.42 (B-9, B-13) |

**The control panel stays the bottleneck.** It has one unit at 120 s with about 88% uptime, about 0.0073 batches/s. The two boilers run at 170 s with about 82% uptime, and both valve trains must be up (about 88% of the time), about 0.0080 batches/s.

**Recorded run (2026-11-20, gemini-3.5-flash).** All 25 citations verified on the first run: 17 figures and 8 baselines.

## Files

| Path | What |
| --- | --- |
| `docs/demo-packs/boiler/*.md`, `pack.json` | Pack sources (overview, datasheets, reference sheets), log settings; the `*-log.md` files are generated |
| `scripts/src/demo-packs.ts` | Generates the stoppage logs, renders every document to PDF, writes `pack.json` |
| `scripts/src/record-demo-figures.ts` | Runs `fillParameters` on each machine with its pack and writes the recorded figures |
| `apps/frontend/public/worlds/boiler/docs/` | The PDFs and `pack.json` |
| `apps/frontend/src/twin/sample-figures/boiler.json` | Recorded figures, baselines and citations |
| `packages/agent/src/verify-citation.ts` | PDF page text and the claim verifier |
| `packages/agent/src/agents/document-reader.ts` | Returns kind, quotes and baselines |
| `apps/api/src/routes/twin.ts` | `POST /twin/verify` |
| `packages/sim/src/citation.ts` | Figures to claims (`citationsOf`), range status, duty |
| `apps/frontend/src/twin/demo-pack.ts`, `twin/Citation.tsx`, `results/documents-tab.tsx` | Attaching packs, the twin step's citations, the Results "Documents" tab |
| `tests/agent/verify-citation.test.ts`, `tests/demo-packs/packs.test.ts` | Verifier unit tests; every pack's logs, labels and recorded citations |

## Adding the next plant

1. Write `docs/demo-packs/<world>/`: `pack.json` (machines, documents, log settings), an overview, datasheets and reference sheets. Reference sheets use only **Verified** figures from `docs/validation/<world>/`.
2. Run `pnpm --filter @repo/scripts demo-packs <world>`.
3. The user reviews the pack.
4. Run `pnpm --filter @repo/scripts record-demo-figures <world>`. It fails unless every citation verifies.
5. Run the root tests. `tests/demo-packs/packs.test.ts` picks up every world with a `pack.json`.

## Cost feedback (added 2026-11-21)

After a shift runs, the Results step's **Cost** tab shows what it cost and where.

- **Rates.** Four rates, kept in rupees:
  - value of a part not shipped
  - cost of a scrapped part
  - technician time per hour
  - spares per breakdown repair

  A demo world reads them from the **cost sheet** in its pack (`cost-sheet.md`, a demo document). The recording script reads them with `readCostRates` and verifies them like every other figure. They're re-checked on each visit. For your own plants you type them in, and they're marked "Set by you".
- **Where the shift lost money.** The shift is re-simulated over its days, once with no breakdowns anywhere and once with each machine's breakdowns taken out alone. It runs under the crew's playbook when there is one, else standard rules. Money lost is:
  - output lost × value of a part
  - scrap × scrap cost
  - crew-hours × technician rate
  - repairs × spares

  Each machine is costed the same way, and machines are listed costliest first.
- **Agents against standard rules.** The playbook's days against standard rules on the same days, per shift and per year (260 shifts). This needs the crew-work counters the kernel now keeps in `Kpis.crew`.
- **Brief.** `adviseOnCost` writes 3–4 sentences from the figures as the page shows them. Every number in it is traced back to those figures with `traceNumbers`, and misses are flagged.
- **Currency.** INR by default, with a USD toggle at one stated rate: $1 = ₹92.9699, the FBIL USD/INR reference rate for 20 Nov 2026 (MSEI archive).

| File | What |
| --- | --- |
| `packages/sim/src/cost.ts`, `kpi.ts`, `kernel.ts` | Money model, exchange rate, crew-work counters |
| `packages/agent/src/agents/cost-reader.ts`, `cost-advisor.ts` | Reading a cost sheet; writing the brief |
| `apps/api/src/routes/twin.ts` | `POST /twin/cost-brief` |
| `apps/frontend/src/results/cost.ts`, `cost-tab.tsx` | Measuring losses, the report, the tab |
| `tests/sim/cost.test.ts`, `tests/results/cost.test.ts` | Money model, crew counters, report and tracing |
