# Boring mill (Machine shop)

Machine `machine-shop-1` · count 1 · station · sample `machine-shop`. Method and source IDs: [../README.md](../README.md).

## Equipment class

**Horizontal boring mill** (table or floor type) machining large castings. Whether it is CNC or manual is not visible. No public field data for boring mills was found. The closest verified class is S2: CNC turning centres, a different machine tool sharing the CNC, axis drives, spindle, hydraulics and lubrication sub-systems. S2 is used as a **proxy class**.

## What the sim uses today

| Parameter            | Value in the sample   | Where it comes from                         |
| -------------------- | --------------------- | ------------------------------------------- |
| `units`              | 1                     | `sample.ts` (user input)                    |
| `cycleTime`          | 120 s per casting     | Hard-coded fallback, provenance `assumed`   |
| `cycleTimeVariation` | 0.25                  | Hard-coded fallback, `assumed`              |
| `mtbf`               | 4 h of working time   | Hard-coded fallback, `assumed`; Weibull shape 2 in the kernel |
| `mttr`               | 20 min (0.33 h)       | Hard-coded fallback, `assumed`; exponential in the kernel |
| `scrapRate`          | 0.01                  | Hard-coded fallback, `assumed`              |
| Uptime (derived)     | 0.923; 0.908 at 34 °C | MTBF / (MTBF + MTTR)                        |

Researched values, once a manufacturer and model or a manual is added, are AI-drafted at runtime with provenance and are not fixed in code.

## Published baseline

S2, Patil et al. 2021, _Acta Polytechnica Hungarica_ 18(6), field data from 50 CNC turning centres of one model, 959 time-between-failure records (**Verified**):

| Figure                         | Published value                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| MTBF                           | "The MTBF of the CNCMT2 is nearly 2000 hrs." Table 5, converged Weibull 3P fit (the text gives its location as 13.23 h): shape 0.909, scale 1895 h, MTBF 1996 h |
| Failure-time shape             | "The shape parameter of the CNCMT2 is nearly equal to 1 and reveals that the failure rate of the CNCMT2 is almost constant." |
| Repair                         | "the CNCMT's failure and repair rates are nearly constant"                                                          |
| Steady-state availability      | 0.9063; "It varies from 0.922 to 0.8882 … for 90% confidence level"                                                 |
| MTTR                           | Given per sub-system as repair rates (Table 7); a single machine-level MTTR was not read and is not used             |

S2 does not state, in the parts read, whether its MTBF is over calendar or operating hours.

| Parameter          | Published value                 | Source |
| ------------------ | ------------------------------- | ------ |
| Boring time per casting | not found in a verified source | –   |

## Comparison

| Parameter        | Sim                            | Baseline (proxy class)          | Status                                   |
| ---------------- | ------------------------------ | ------------------------------- | ---------------------------------------- |
| MTBF             | 4 h (working)                  | about 2000 h                    | outside range                            |
| Failure shape    | Weibull shape 2 (rising hazard) | shape ≈ 0.9 (near constant)    | outside range                            |
| Repair shape     | exponential (constant rate)    | "nearly constant" repair rate   | within range                             |
| Availability     | 0.923 (0.908 at 34 °C)         | 0.8882–0.922                    | outside range at 25 °C (just above); within range at 34 °C |
| MTTR             | 0.33 h                         | not read as a single figure     | not yet comparable                       |
| Cycle time       | 120 s per casting              | not found in a verified source  | not yet comparable                       |
| Cycle-time variation, scrap | 0.25, 0.01          | not found in a verified source  | not yet comparable                       |

The availability lands near the proxy's by coincidence of two wrong figures: S2's machines fail about every 2000 h and stay down long enough to give 0.906, while the sim's fail every 4 h and come back in 20 minutes. Shift to shift, the two patterns behave very differently (**Inference**): the sim's boring mill stops about twice in every shift, the proxy's about once in 250 shifts of continuous running.

## Validation plan

1. **Class baseline.** Data: field data for horizontal boring mills (machine builder's service statistics, or OREDA@cloud (S6) if it covers machine tools; not checked). Until found, keep S2 as the proxy and say so in the provenance note.
2. **Kernel shape check.** Data: S2's Weibull fit. Test: run the isolated station, kept busy, for a horizon of at least 1,000 × MTBF, and fit a Weibull to simulated times to failure. The fit will return shape 2 by construction; the test is whether the team keeps shape 2 for machine tools. Proposed acceptance: a per-class shape setting, with machine tools near 1 as S2 reports.
3. **Tool wear (public real data).** Data: NASA PCoE Milling and CNC Milling Machine (PHM 2010) sets (S9). Test: tool life in cutting minutes, to decide whether tool changes belong in cycle time (planned) or in failures (random). Proposed acceptance: tool changes modelled as whichever has the closer fit to the measured tool lives.
4. **Real plant data.** Data: the mill's CNC alarm history and maintenance work orders for two or more years, and spindle-on hours. Test: MTBF per spindle-on hour and MTTR against the twin; cycle times per casting from the CNC program run log against the kernel's log-normal. Proposed acceptance: MTBF and MTTR inside the 90% confidence intervals of the plant's rates; cycle-time mean within ±10%, coefficient of variation within ±0.1.
