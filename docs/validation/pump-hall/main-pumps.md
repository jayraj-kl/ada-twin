# Main pumps (Pump hall)

Machine `pump-hall-1` · count 2 · station · sample `pump-hall`. Method and source IDs: [../README.md](../README.md).

## Equipment class

**Water-service centrifugal pump**, electric-motor driven, lifting water from a suction tank to a header. Public class: S1 "Pump / Centrifugal" (H26-100), with "Integral Drive" (H26-110) and "Without Drive" (H26-120). OREDA (S6) also has centrifugal pump data but is paywalled.

## What the sim uses today

| Parameter            | Value in the sample   | Where it comes from                         |
| -------------------- | --------------------- | ------------------------------------------- |
| `units`              | 2 (working in parallel) | `sample.ts` (user input)                  |
| `cycleTime`          | 120 s per batch       | Hard-coded fallback, provenance `assumed`   |
| `cycleTimeVariation` | 0.25                  | Hard-coded fallback, `assumed`              |
| `mtbf`               | 4 h of working time   | Hard-coded fallback, `assumed`              |
| `mttr`               | 20 min (0.33 h)       | Hard-coded fallback, `assumed`              |
| `scrapRate`          | 0.01                  | Hard-coded fallback, `assumed`              |
| Uptime (derived)     | 0.923; 0.908 at 34 °C | MTBF / (MTBF + MTTR)                        |

A scrapped batch of water has no clear physical meaning; `scrapRate` is better set to 0 for this machine (**Inference**). Researched values, once a model or manual is given, are AI-drafted at runtime with provenance and are not fixed in code.

## Published baseline

S1 = TM 5-698-5, Appendix B, page B-9. Calendar-time MTBF.

| Class (item)              | Unit-years | Failures | MTBF (h)  | MTTR (h) | Inherent availability | Operational availability |
| ------------------------- | ---------: | -------: | --------: | -------: | --------------------: | -----------------------: |
| Pump (H26-000)            |     1742.2 |       11 | 1,387,387 |     7.09 |           0.999994889 |              0.999826613 |
| Centrifugal (H26-100)     |     1376.8 |        8 | 1,507,638 |     6.75 |           0.999995523 |              0.999903450 |
| Integral Drive (H26-110)  |      665.5 |        5 | 1,166,025 |     7.40 |           0.999993654 |              0.999887429 |
| Without Drive (H26-120)   |      711.3 |        3 | 2,076,992 |     5.67 |           0.999997272 |              0.999909083 |

The motor is a separate S1 class: "Motor, Electric / Induction" (E29-200): 712.5 unit-years, 13 failures, MTBF 480,090.4 h, MTTR 3.38 h (page B-8). For "Without Drive" pumps, the motor's failures add to the pump's (**Inference**).

| Parameter                       | Published value                 | Source |
| ------------------------------- | ------------------------------- | ------ |
| Cycle time per batch            | not found in a verified source  | –      |

## Comparison

| Parameter    | Sim                 | Baseline (centrifugal sub-classes)                                     | Status             |
| ------------ | ------------------- | ---------------------------------------------------------------------- | ------------------ |
| MTBF         | 4 h (working)       | 1,166,025–2,076,992 h calendar; ≈276,900–493,200 h at 0.237 duty (Derived) | outside range      |
| MTTR         | 0.33 h              | 5.67–7.40 h                                                            | outside range      |
| Availability | 0.923               | Ai 0.999993654–0.999997272                                             | outside range      |
| Cycle time   | 120 s per batch     | not found in a verified source                                         | not yet comparable |
| Cycle-time variation, scrap | 0.25, 0.01 | not found in a verified source                                  | not yet comparable |

A pump in a water station usually runs around the clock, so for this machine the calendar figure is close to the operating figure (**Inference**). The gap stays at about five orders of magnitude.

## Validation plan

1. **Parameter range check.** Data: S1 B-9 and B-8 rows; OREDA when licensed. Test: MTBF (pump + motor in series if the motor is separate) and MTTR against the centrifugal range. Proposed acceptance: inside the H26-110 to H26-120 range, or a cited document explains the difference.
2. **Duty/standby structure.** Data: the plant's operating philosophy (duty/standby or duty/duty). Test: does the twin's two-units-in-parallel match it? Proposed acceptance: matches; if duty/standby, record that the sim cannot represent a standby station and capacity is overstated.
3. **Wear-out shape (public real data).** Data: IMS Bearings and FEMTO Bearing (S9). Test: Weibull shape of bearing times to failure against the kernel's fixed shape 2. Proposed acceptance: shape 2 inside the fitted 90% interval, else record it as unsupported.
4. **Real plant data.** Data: SCADA pump run/trip history and work orders for two or more years; flow meter totals per shift. Test: (a) trips per running hour and repair durations against the twin; (b) once a batch volume is fixed, measured volume per shift against the twin's batches per shift over 60 days. Proposed acceptance: (a) inside the 90% confidence intervals of the plant's rates; (b) the plant's mean shift volume inside the 5th–95th percentile band of the simulated days.
