# Gas valve trains (Boiler room)

Machine `boiler-4` · count 2 · **auxiliary** · sample `boiler`. Method and source IDs: [../README.md](../README.md).

## Equipment class

**Fuel gas valve train** for a burner: an assembly of manual isolation valve, pressure regulator, two automatic safety shut-off valves (solenoid or motorised) and pressure switches. No public source found gives field data for the assembly as a whole. The parts map to:

- S1 "Valve Operator" (C17-000), with "Electric" (C17-100) and "Pneumatic" (C17-300) sub-classes, for the automatic shut-off valves' actuators.
- S1 "Pressure Control Assembly" (C8-000) and "Pressure Regulator" (C9-000) for the regulator.
- S5, the Kromschröder VAS solenoid valve for gas, as one representative manufacturer's shut-off valve.

## What the sim uses today

Parts never pass through an auxiliary machine. The sim uses only failures and repairs.

| Parameter | Value in the sample   | Where it comes from                                                   |
| --------- | --------------------- | --------------------------------------------------------------------- |
| `units`   | 2                     | `sample.ts` (user input)                                              |
| `spares`  | none                  | Not set; the user can add standby units                               |
| `mtbf`    | 4 h of working time   | Hard-coded fallback, provenance `assumed`                             |
| `mttr`    | 20 min (0.33 h)       | Hard-coded fallback, `assumed`                                        |
| Needed by | Drafted at runtime    | Flow-drafter agent links it to the stations or sources that stop when it is down, likely the Boilers (**Inference**) |

In the kernel, while either unit is down (no spares), **every** machine that needs it stops. With two units and no spares, the gas supply is up only while both are up. That is stricter than a plant where each valve train feeds its own boiler (**Inference**: the sim has no per-unit pairing between an auxiliary machine and a station's units).

## Published baseline

S1 = TM 5-698-5, Appendix B, pages B-9 and B-13. Calendar-time MTBF.

| Class (item)                         | Unit-years | Failures | MTBF (h)   | MTTR (h) | Inherent availability | Operational availability |
| ------------------------------------ | ---------: | -------: | ---------: | -------: | --------------------: | -----------------------: |
| Valve Operator (C17-000)             |     9975.4 |       72 | 1,213,674  |    10.71 |           0.999991177 |              0.999971677 |
| Valve Operator, Electric (C17-100)   |     3640.2 |       36 |   885,794  |    18.42 |           0.999979209 |              0.999934083 |
| Valve Operator, Pneumatic (C17-300)  |     6266.9 |       30 | 1,829,941  |     3.00 |           0.999998361 |              0.999997541 |
| Pressure Control Assembly (C8-000)   |      721.3 |        5 | 1,263,676  |     5.60 |           0.999995568 |              0.999938101 |
| Pressure Regulator (C9-000)          |      609.4 |        0 | 10,467,090 (zero-failure estimate) | not available | 1.000000000 | 0.999993069 |

S1 also lists "Valve Operator, Hydraulic" (C17-200: 68.2 unit-years, 6 failures, MTBF 99,616 h, MTTR 3.00 h); hydraulic operators are not usual on burner gas trains, so it is left out of the range.

S5, Kromschröder VAS / VCS Technical Information, Edition 06.19 (**Verified**):

| Figure                                           | Value                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| B10d (cycles until 10% fail dangerously)         | VAS 1: 15,845,898; VAS 2–3: 15,766,605; VAS 6–9: 6,700,000 operating cycles    |
| Designed lifetime                                | 500,000, 200,000, 100,000 or 50,000 switching cycles by size, or 10 years, whichever comes first |
| Safety use                                       | "For systems up to SIL 3 pursuant to EN 61508 and PL e pursuant to ISO 13849"  |

B10d counts **dangerous** failures (failing to close). The sim's failure of a valve train is the opposite effect: gas stops and the boilers stop. B10d therefore cannot be turned into the sim's MTBF.

## Comparison

| Parameter      | Sim                 | Baseline                                                                     | Status             |
| -------------- | ------------------- | ---------------------------------------------------------------------------- | ------------------ |
| MTBF           | 4 h (working)       | 885,794–1,829,941 h calendar (C17-100, C17-300, C8-000); ≈210,300–434,500 h at 0.237 duty (Derived) | outside range |
| MTTR           | 0.33 h              | 3.00–18.42 h                                                                 | outside range      |
| Availability   | 0.923               | Ai 0.999979209–0.999998361                                                   | outside range      |
| Design life    | not modelled        | 50,000–500,000 cycles or 10 years (S5)                                       | not yet comparable |

A valve train fails as a set of parts in series, so its MTBF is shorter than any one part's (**Inference**). Even a train of ten parts each at the lowest MTBF above (885,794 h) would have an MTBF near 88,600 h calendar (**Derived**, constant failure rates in series), still far above 4 h.

## Validation plan

1. **Build the train from parts.** Data: S1 rows above, plus the valve train's parts list from the user's drawings. Test: series MTBF = 1 / Σ(1 / MTBFᵢ) and a part-weighted MTTR, compared with the twin's values. Proposed acceptance: the twin's MTBF and MTTR within a factor of 2 of the built-up figures.
2. **Check the dependency structure.** Data: the plant's piping and instrument diagram. Test: does each boiler need one train or both? If one, the twin needs one auxiliary machine per boiler (two machines of count 1) rather than one machine of count 2. Proposed acceptance: the drafted `needs` links match the diagram.
3. **Real plant data.** Data: burner management system trip log (lockouts with cause) and work orders for two or more years. Test: count trips caused by the gas train (low gas pressure, valve proving failure) per firing hour against the twin's MTBF. Proposed acceptance: twin MTBF inside the 90% confidence interval of the plant's rate (chi-squared interval for a Poisson count).
