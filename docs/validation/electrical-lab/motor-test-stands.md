# Motor test stands (Electrical lab)

Machine `electrical-lab-2` · count 4 · station · sample `electrical-lab`. Method and source IDs: [../README.md](../README.md).

## Equipment class

**Motor test stand with motor-generator set**: a bed on which a rewound motor is coupled and run up, loaded or supplied by a motor-generator (MG) set, with switchgear and meters. The part that fails most like a machine is the MG set. Public class: S1 "Motor Generator Set" (E27-000), "3 Phase" (E27-100), with "60Hz" (E27-110) and "400Hz" (E27-120) sub-classes.

## What the sim uses today

| Parameter            | Value in the sample   | Where it comes from                         |
| -------------------- | --------------------- | ------------------------------------------- |
| `units`              | 4                     | `sample.ts` (user input)                    |
| `cycleTime`          | 120 s per motor       | Hard-coded fallback, provenance `assumed`   |
| `cycleTimeVariation` | 0.25                  | Hard-coded fallback, `assumed`              |
| `mtbf`               | 4 h of working time   | Hard-coded fallback, `assumed`              |
| `mttr`               | 20 min (0.33 h)       | Hard-coded fallback, `assumed`              |
| `scrapRate`          | 0.01                  | Hard-coded fallback, `assumed`; stands in for motors failing the test |
| Uptime (derived)     | 0.923; 0.908 at 34 °C | MTBF / (MTBF + MTTR)                        |

If the user gives the MG set's manufacturer and model or its manual, "Find its parameters" drafts values at runtime with provenance; they are not fixed in code.

## Published baseline

S1 = TM 5-698-5, Appendix B, page B-7. Calendar-time MTBF.

| Class (item)                  | Unit-years | Failures | MTBF (h)   | MTTR (h) | Inherent availability | Operational availability |
| ----------------------------- | ---------: | -------: | ---------: | -------: | --------------------: | -----------------------: |
| Motor Generator Set (E27-000) |      435.4 |       11 | 346,741.0  |     7.45 |           0.999978501 |              0.993070544 |
| 3 Phase (E27-100)             |      435.4 |       11 | 346,741.0  |     7.45 |           0.999978501 |              0.993070544 |
| 3 Phase, 60Hz (E27-110)       |      232.9 |       10 | 203,980.8  |     7.40 |           0.999963722 |              0.987366458 |
| 3 Phase, 400Hz (E27-120)      |      202.6 |        1 | 1,774,344  |     8.00 |           0.999995491 |              0.999628032 |

| Parameter                     | Published value                 | Source |
| ----------------------------- | ------------------------------- | ------ |
| Test duration per motor       | not found in a verified source  | –      |
| Test failure rate of rewound motors | not found in a verified source | –   |

## Comparison

| Parameter    | Sim                 | Baseline                                                                | Status             |
| ------------ | ------------------- | ----------------------------------------------------------------------- | ------------------ |
| MTBF         | 4 h (working)       | 203,980.8–1,774,344 h calendar; ≈48,430–421,300 h at 0.237 duty (Derived) | outside range      |
| MTTR         | 0.33 h              | 7.40–8.00 h                                                             | outside range      |
| Availability | 0.923               | Ai 0.999963722–0.999995491                                              | outside range      |
| Cycle time   | 120 s per motor     | not found in a verified source                                          | not yet comparable |
| Cycle-time variation, scrap | 0.25, 0.01 | not found in a verified source                                   | not yet comparable |

The S1 MG-set data is thin (11 failures in total, 1 in the 400 Hz class), so the 400 Hz MTBF in particular has a wide uncertainty. Operational availability (Ao) for the 60 Hz class is 0.987366458, much lower than its inherent availability, because S1's Ao also counts preventive maintenance and logistics delay.

## Validation plan

1. **Parameter range check.** Data: S1 B-7 rows; the MG set's nameplate (frequency, rating) to pick the row. Test: MG-set MTBF (operating basis, from the lab's running hours) and MTTR against the chosen row. Proposed acceptance: within a factor of 3 of the row's MTBF, given its small failure count, and inside 7.40–8.00 h for MTTR.
2. **Bearing wear (public real data).** Data: IMS Bearings and FEMTO Bearing (S9). Test: Weibull shape of bearing times to failure against the kernel's shape 2. Proposed acceptance: shape 2 inside the fitted 90% interval, else record it as unsupported for rotating machines.
3. **Test time and pass rate (real plant data).** Data: test sheets for at least 50 motors (start, end, pass or fail). Test: test-time mean and coefficient of variation against the twin; fail rate against `scrapRate`. Proposed acceptance: mean within ±10%, coefficient of variation within ±0.1; fail rate inside the 90% binomial interval of the observed.
4. **Stand stoppages.** Data: work orders on the stands and MG sets for two or more years. Proposed acceptance: twin MTBF and MTTR inside the 90% confidence intervals of the recorded rates.
