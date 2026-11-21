# Inspection bench (Machine shop)

Machine `machine-shop-4` · count 1 · station · sample `machine-shop`. Method and source IDs: [../README.md](../README.md).

## Equipment class

**Manual dimensional inspection bench**: a surface plate or bench with hand gauges (calipers, micrometers, height gauge, bore gauges) and an inspector. If the plant measures on a coordinate measuring machine instead, the class changes. The panorama does not show which.

## What the sim uses today

| Parameter            | Value in the sample   | Where it comes from                         |
| -------------------- | --------------------- | ------------------------------------------- |
| `units`              | 1                     | `sample.ts` (user input)                    |
| `cycleTime`          | 120 s per casting     | Hard-coded fallback, provenance `assumed`   |
| `cycleTimeVariation` | 0.25                  | Hard-coded fallback, `assumed`              |
| `mtbf`               | 4 h of working time   | Hard-coded fallback, `assumed`              |
| `mttr`               | 20 min (0.33 h)       | Hard-coded fallback, `assumed`              |
| `scrapRate`          | 0.01                  | Hard-coded fallback, `assumed`              |
| Uptime (derived)     | 0.923; 0.908 at 34 °C | MTBF / (MTBF + MTTR)                        |

`scrapRate` here plays the part of castings rejected at inspection.

## Published baseline

| Parameter                       | Published value                 | Source |
| ------------------------------- | ------------------------------- | ------ |
| MTBF, MTTR, availability        | not found in a verified source  | –      |
| Inspection time per casting     | not found in a verified source  | –      |
| Reject rate at final inspection | not found in a verified source  | –      |

S1's "Gauge" class (C5-000) covers facility gauges such as fluid-level gauges, not dimensional measuring instruments, so it is not used.

## Comparison

| Parameter    | Sim                 | Baseline                        | Status             |
| ------------ | ------------------- | ------------------------------- | ------------------ |
| MTBF         | 4 h (working)       | not found in a verified source  | not yet comparable |
| MTTR         | 0.33 h              | not found in a verified source  | not yet comparable |
| Availability | 0.923               | not found in a verified source  | not yet comparable |
| Cycle time   | 120 s per casting   | not found in a verified source  | not yet comparable |
| Cycle-time variation, scrap | 0.25, 0.01 | not found in a verified source | not yet comparable |

A bench of hand gauges does not break down twice a shift (**Inference**). Its real stops are gauge calibration, waiting for the inspector, and first-article checks, which the sim's random-failure model does not represent. Modelling it with no failures (the sim's graph allows a station with no MTBF) may be closer than the fallback; that is a choice for the user, not a validated figure.

## Validation plan

1. **Time study (real plant data).** Data: inspection timestamps or inspection reports with start and end times for at least 100 castings. Test: mean and coefficient of variation against `cycleTime` and `cycleTimeVariation`; two-sample Kolmogorov–Smirnov test against the kernel's log-normal. Proposed acceptance: mean within ±10%, coefficient of variation within ±0.1, KS not rejected at the 5% level.
2. **Reject rate.** Data: non-conformance reports over at least three months. Test: rejected castings / inspected castings against `scrapRate`. Proposed acceptance: twin rate inside the 90% binomial confidence interval of the observed rate.
3. **Stoppages.** Data: the same reports, noting gauge-out-of-calibration and waiting time. Decide whether to keep a failure model at all for this machine.
