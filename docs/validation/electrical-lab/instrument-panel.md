# Instrument panel (Electrical lab)

Machine `electrical-lab-3` · count 1 · station · sample `electrical-lab`. Method and source IDs: [../README.md](../README.md).

## Equipment class

**Test and measurement instrument panel**: meters, insulation and resistance testers and recorders where each passed motor "is checked" before dispatch. No public class for test instrument panels was found. S1 "Control Panel" (C4-000) and "Control System" (C12-000) are used as a **proxy** for a cabinet of electrical and electronic equipment. S1's control panels are facility control cabinets, not test instruments.

## What the sim uses today

| Parameter            | Value in the sample   | Where it comes from                         |
| -------------------- | --------------------- | ------------------------------------------- |
| `units`              | 1                     | `sample.ts` (user input)                    |
| `cycleTime`          | 120 s per motor       | Hard-coded fallback, provenance `assumed`   |
| `cycleTimeVariation` | 0.25                  | Hard-coded fallback, `assumed`              |
| `mtbf`               | 4 h of working time   | Hard-coded fallback, `assumed`              |
| `mttr`               | 20 min (0.33 h)       | Hard-coded fallback, `assumed`              |
| `scrapRate`          | 0.01                  | Hard-coded fallback, `assumed`              |
| Uptime (derived)     | 0.923; 0.908 at 34 °C | MTBF / (MTBF + MTTR)                        |

With one unit, this is the sample's bottleneck: 221.5 motors per shift (**Derived**, see [README.md](README.md)).

## Published baseline

S1 = TM 5-698-5, Appendix B, pages B-5 and B-9 (proxy). Calendar-time MTBF.

| Class (item)                          | Unit-years | Failures | MTBF (h)   | MTTR (h) | Inherent availability |
| ------------------------------------- | ---------: | -------: | ---------: | -------: | --------------------: |
| Control Panel (C4-000)                |     5643.4 |       30 | 1,647,876  |     1.80 |           0.999998908 |
| Control System (C12-000)              |      551.0 |      244 |  19,782.19 |     2.88 |           0.999854564 |
| Control System, ≤1k points (C12-100)  |      373.9 |       94 |  34,841.10 |     1.60 |           0.999954199 |

| Parameter                     | Published value                 | Source |
| ----------------------------- | ------------------------------- | ------ |
| Final check time per motor    | not found in a verified source  | –      |
| Instrument MTBF (manufacturer) | not found in a verified source | –      |

## Comparison

| Parameter    | Sim                 | Baseline (proxy)                                                        | Status                     |
| ------------ | ------------------- | ----------------------------------------------------------------------- | -------------------------- |
| MTBF         | 4 h (working)       | 19,782.19–1,647,876 h calendar; ≈4,700–391,300 h at 0.237 duty (Derived) | outside range (proxy only) |
| MTTR         | 0.33 h              | 1.60–2.88 h                                                             | outside range (proxy only) |
| Availability | 0.923               | Ai 0.999854564–0.999998908                                              | outside range (proxy only) |
| Cycle time   | 120 s per motor     | not found in a verified source                                          | not yet comparable         |
| Cycle-time variation, scrap | 0.25, 0.01 | not found in a verified source                                   | not yet comparable         |

A failed meter is usually swapped from a spare in minutes, and calibration is planned (**Inference**). The plant's own records matter more here than any class figure.

## Validation plan

1. **Instrument list.** Data: the panel's instrument list with manufacturers and models. Test: manufacturers' published MTBF where available (provenance `web`, confidence `datasheet`), combined in series. Proposed acceptance: the twin's MTBF within a factor of 2 of the built-up figure, and recorded with provenance.
2. **Check time (real plant data).** Data: final-check records for at least 100 motors with start and end times. Test: mean and coefficient of variation against `cycleTime` and `cycleTimeVariation`; two-sample Kolmogorov–Smirnov against the kernel's log-normal. Proposed acceptance: mean within ±10%, coefficient of variation within ±0.1, KS not rejected at the 5% level.
3. **Stoppages.** Data: calibration and repair records for two or more years. Separate planned calibration (a preventive stop) from failures; set MTBF and MTTR from failures only. Proposed acceptance: twin values inside the 90% confidence intervals of the recorded rates.
