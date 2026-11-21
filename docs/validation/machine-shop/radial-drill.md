# Radial drill (Machine shop)

Machine `machine-shop-3` · count 1 · station · sample `machine-shop`. Method and source IDs: [../README.md](../README.md).

## Equipment class

**Radial arm drilling machine**: a column, a swinging arm and a drill head, usually manually positioned, drilling and tapping holes in large castings. It has a spindle, gearbox and arm clamping but often no CNC. S2 (CNC turning centres) is a **weak proxy**: its CNC, turret and axis-drive failures have no counterpart here. It is shown only so the order of magnitude is on record.

## What the sim uses today

| Parameter            | Value in the sample   | Where it comes from                         |
| -------------------- | --------------------- | ------------------------------------------- |
| `units`              | 1                     | `sample.ts` (user input)                    |
| `cycleTime`          | 120 s per casting     | Hard-coded fallback, provenance `assumed`   |
| `cycleTimeVariation` | 0.25                  | Hard-coded fallback, `assumed`              |
| `mtbf`               | 4 h of working time   | Hard-coded fallback, `assumed`; Weibull shape 2 |
| `mttr`               | 20 min (0.33 h)       | Hard-coded fallback, `assumed`; exponential |
| `scrapRate`          | 0.01                  | Hard-coded fallback, `assumed`              |
| Uptime (derived)     | 0.923; 0.908 at 34 °C | MTBF / (MTBF + MTTR)                        |

## Published baseline

| Parameter                   | Published value                                              | Source |
| --------------------------- | ------------------------------------------------------------ | ------ |
| MTBF (weak proxy)           | "nearly 2000 hrs" for CNC turning centres                    | S2     |
| Availability (weak proxy)   | 0.9063; 0.8882–0.922 at 90% confidence                       | S2     |
| Radial drill MTBF, MTTR     | not found in a verified source                               | –      |
| Drilling time per casting   | not found in a verified source                               | –      |

## Comparison

| Parameter    | Sim                     | Baseline                          | Status                                       |
| ------------ | ----------------------- | --------------------------------- | -------------------------------------------- |
| MTBF         | 4 h (working)           | about 2000 h (weak proxy)         | outside range (proxy only)                   |
| Availability | 0.923 (0.908 at 34 °C)  | 0.8882–0.922 (weak proxy)         | outside at 25 °C, within at 34 °C (proxy only) |
| MTTR         | 0.33 h                  | not found in a verified source    | not yet comparable                           |
| Cycle time   | 120 s per casting       | not found in a verified source    | not yet comparable                           |
| Cycle-time variation, scrap | 0.25, 0.01 | not found in a verified source    | not yet comparable                           |

A simpler, mostly mechanical machine would be expected to fail less often than a CNC turning centre, so the proxy is more likely a floor than a match (**Inference**, untested). Either way the 4 h fallback sits far below it.

## Validation plan

1. **Cycle time from the job.** Data: hole count, diameters and depths per reference casting, from the user's drawing; feeds and speeds from the drill's manual. Test: drilling time + positioning per hole against `cycleTime`. Proposed acceptance: within ±20% once a reference casting is agreed.
2. **Time study (real plant data).** Data: at least 50 timed castings. Test: mean and coefficient of variation against the twin; two-sample Kolmogorov–Smirnov test against the kernel's log-normal. Proposed acceptance: mean within ±10%, coefficient of variation within ±0.1, KS not rejected at the 5% level.
3. **Failures (real plant data).** Data: work orders for two or more years and the machine's running hours. Proposed acceptance: twin MTBF and MTTR inside the 90% confidence intervals of the plant's rates.
