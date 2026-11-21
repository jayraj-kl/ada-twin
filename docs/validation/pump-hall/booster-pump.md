# Booster pump (Pump hall)

Machine `pump-hall-2` · count 1 · station · sample `pump-hall`. Method and source IDs: [../README.md](../README.md).

## Equipment class

**Booster centrifugal pump**: an inline or end-suction centrifugal pump raising header pressure, motor driven. Same public class as the [Main pumps](main-pumps.md): S1 "Pump / Centrifugal" (H26-100) and sub-classes.

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

With one unit, this is one of the sample's two single-unit machines and a likely bottleneck: 221.5 batches per shift (**Derived**).

## Published baseline

S1 = TM 5-698-5, Appendix B, page B-9. Calendar-time MTBF.

| Class (item)              | Unit-years | Failures | MTBF (h)  | MTTR (h) | Inherent availability |
| ------------------------- | ---------: | -------: | --------: | -------: | --------------------: |
| Centrifugal (H26-100)     |     1376.8 |        8 | 1,507,638 |     6.75 |           0.999995523 |
| Integral Drive (H26-110)  |      665.5 |        5 | 1,166,025 |     7.40 |           0.999993654 |
| Without Drive (H26-120)   |      711.3 |        3 | 2,076,992 |     5.67 |           0.999997272 |

| Parameter              | Published value                 | Source |
| ---------------------- | ------------------------------- | ------ |
| Cycle time per batch   | not found in a verified source  | –      |

## Comparison

| Parameter    | Sim                 | Baseline                                                               | Status             |
| ------------ | ------------------- | ---------------------------------------------------------------------- | ------------------ |
| MTBF         | 4 h (working)       | 1,166,025–2,076,992 h calendar; ≈276,900–493,200 h at 0.237 duty (Derived) | outside range      |
| MTTR         | 0.33 h              | 5.67–7.40 h                                                            | outside range      |
| Availability | 0.923               | Ai 0.999993654–0.999997272                                             | outside range      |
| Cycle time   | 120 s per batch     | not found in a verified source                                         | not yet comparable |
| Cycle-time variation, scrap | 0.25, 0.01 | not found in a verified source                                  | not yet comparable |

A booster pump does not hold a batch for a set time: water passes through it at the header's flow. Modelling it as a queueing station with its own cycle time makes it a possible bottleneck in the sim when, physically, it is sized to the main pumps' flow (**Inference**). A validation should first decide whether it belongs on the flow as a station at all, or as an auxiliary machine the outlet cannot run without.

## Validation plan

1. **Model role.** Data: the station's hydraulic layout. Test: is the booster in series with every batch (station) or a pressure support that only stops the outlet when it fails (auxiliary)? Proposed acceptance: the twin's role matches the layout.
2. **Parameter range check.** As for [main-pumps.md](main-pumps.md), plan 1.
3. **Real plant data.** Data: SCADA run/trip history, header pressure log and work orders for two or more years. Test: trips per running hour and repair durations against the twin. Proposed acceptance: inside the 90% confidence intervals of the plant's rates.
