# Control panel (Boiler room)

Machine `boiler-3` · count 1 · station · sample `boiler`. Method and source IDs: [../README.md](../README.md).

## Equipment class

**Boiler control panel**: the cabinet of controls and instruments where, in this sample, each batch "is checked". In published data the hardware maps to S1 "Control Panel" (C4-000) and, for a cabinet built around a programmable controller, S1 "Control System" (C12-000, split by number of acquisition points).

The sim treats it as a station that every batch passes through, so it has a cycle time as well as failures. The check itself is a person's task; its time has no published class figure.

## What the sim uses today

| Parameter            | Value in the sample   | Where it comes from                         |
| -------------------- | --------------------- | ------------------------------------------- |
| `units`              | 1                     | `sample.ts` (user input)                    |
| `cycleTime`          | 120 s per batch       | Hard-coded fallback, provenance `assumed`   |
| `cycleTimeVariation` | 0.25                  | Hard-coded fallback, `assumed`              |
| `mtbf`               | 4 h of working time   | Hard-coded fallback, `assumed`              |
| `mttr`               | 20 min (0.33 h)       | Hard-coded fallback, `assumed`              |
| `scrapRate`          | 0.01                  | Hard-coded fallback, `assumed`              |
| Uptime (derived)     | 0.923; 0.908 at 34 °C | MTBF / (MTBF + MTTR)                        |

With one unit, this is the sample's bottleneck: 221.5 batches per shift (**Derived**, see [README.md](README.md)).

## Published baseline

S1 = TM 5-698-5, Appendix B, pages B-5 (Control Panel) and B-9 (Control System). Calendar-time MTBF. Rows with no failures (marked * in S1) are left out.

| Class (item)                              | Unit-years | Failures | MTBF (h)   | MTTR (h) | Inherent availability | Operational availability |
| ----------------------------------------- | ---------: | -------: | ---------: | -------: | --------------------: | -----------------------: |
| Control Panel (C4-000)                    |     5643.4 |       30 | 1,647,876  |     1.80 |           0.999998908 |              0.999800824 |
| Control Panel, Generator w/o Switchgear (C4-100) | 1710.4 |    19 |   788,570.5 |    2.11 |           0.999997330 |              0.999980962 |
| Control Panel, Switchgear (C4-300)        |      560.6 |       11 |   446,426.1 |    1.27 |           0.999997149 |              0.998160003 |
| Control System (C12-000)                  |      551.0 |      244 |  19,782.19 |     2.88 |           0.999854564 |              0.999658784 |
| Control System, ≤1k points (C12-100)      |      373.9 |       94 |  34,841.10 |     1.60 |           0.999954199 |              0.999888246 |
| Control System, >1k points (C12-200)      |      177.1 |      150 |  10,345.28 |     3.68 |           0.999644282 |              0.999174503 |

- **Cycle time for a check:** not found in a verified source.
- MIL-HDBK-217F (parts-count prediction for electronics) would give a predicted, not field, figure; not consulted.

## Comparison

| Parameter    | Sim                 | Baseline                                                                | Status             |
| ------------ | ------------------- | ----------------------------------------------------------------------- | ------------------ |
| MTBF         | 4 h (working)       | 10,345.28–1,647,876 h calendar; ≈2,460–391,300 h at 0.237 duty (Derived) | outside range      |
| MTTR         | 0.33 h              | 1.27–3.68 h                                                             | outside range      |
| Availability | 0.923               | Ai 0.999644282–0.999998908                                              | outside range      |
| Cycle time   | 120 s per batch     | not found in a verified source                                          | not yet comparable |
| Cycle-time variation, scrap | 0.25, 0.01 | not found in a verified source                                   | not yet comparable |

The control system classes fail far more often than the plain panels (244 failures in 551.0 unit-years against 30 in 5643.4), so the class chosen matters by about two orders of magnitude. The user's machine notes should say which it is.

## Validation plan

1. **Class choice.** Ask the user, or read the panel's documents, for whether it holds a programmable controller and how many I/O points. Pick C4-000, C12-100 or C12-200 accordingly.
2. **Parameter range check.** Data: S1 rows above. Test: MTBF (operating basis) and MTTR against the chosen row. Proposed acceptance: within a factor of 3 of the chosen row's MTBF (S1 gives no spread within a row) and inside 1.27–3.68 h for MTTR.
3. **Check time (real plant data).** Data: timestamps of batch checks from the plant's log, at least 200 checks. Test: compare the measured mean and coefficient of variation with `cycleTime` and `cycleTimeVariation`, and run a two-sample Kolmogorov–Smirnov test of the measured times against draws from the kernel's log-normal. Proposed acceptance: mean within ±10%, coefficient of variation within ±0.1, KS test not rejected at the 5% level.
4. **Real plant data, failures.** Data: work orders for the panel over two or more years. Test as in [feed-pumps.md](feed-pumps.md), plan 4.
