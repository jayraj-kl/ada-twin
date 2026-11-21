# Control panel (Pump hall)

Machine `pump-hall-3` · count 1 · station · sample `pump-hall`. Method and source IDs: [../README.md](../README.md).

## Equipment class

**Pumping-station control panel**: motor starters, PLC or relay logic and instruments, where each batch "is checked". Hardware maps to S1 "Control Panel" (C4-000) and, if built around a programmable controller, S1 "Control System" (C12-000). The same class as the boiler room's [Control panel](../boiler/control-panel.md).

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

## Published baseline

S1 = TM 5-698-5, Appendix B, pages B-5 and B-9. Calendar-time MTBF.

| Class (item)                          | Unit-years | Failures | MTBF (h)   | MTTR (h) | Inherent availability |
| ------------------------------------- | ---------: | -------: | ---------: | -------: | --------------------: |
| Control Panel (C4-000)                |     5643.4 |       30 | 1,647,876  |     1.80 |           0.999998908 |
| Control Panel, Switchgear (C4-300)    |      560.6 |       11 |   446,426.1 |    1.27 |           0.999997149 |
| Control System (C12-000)              |      551.0 |      244 |  19,782.19 |     2.88 |           0.999854564 |
| Control System, ≤1k points (C12-100)  |      373.9 |       94 |  34,841.10 |     1.60 |           0.999954199 |
| Control System, >1k points (C12-200)  |      177.1 |      150 |  10,345.28 |     3.68 |           0.999644282 |

The full table, with operational availability, is in [../boiler/control-panel.md](../boiler/control-panel.md).

| Parameter              | Published value                 | Source |
| ---------------------- | ------------------------------- | ------ |
| Check time per batch   | not found in a verified source  | –      |

## Comparison

| Parameter    | Sim                 | Baseline                                                                | Status             |
| ------------ | ------------------- | ----------------------------------------------------------------------- | ------------------ |
| MTBF         | 4 h (working)       | 10,345.28–1,647,876 h calendar; ≈2,460–391,300 h at 0.237 duty (Derived) | outside range      |
| MTTR         | 0.33 h              | 1.27–3.68 h                                                             | outside range      |
| Availability | 0.923               | Ai 0.999644282–0.999998908                                              | outside range      |
| Cycle time   | 120 s per batch     | not found in a verified source                                          | not yet comparable |
| Cycle-time variation, scrap | 0.25, 0.01 | not found in a verified source                                   | not yet comparable |

In a real pump hall the panel does not process water; when it fails, the pumps it controls stop (**Inference**). That is the sim's auxiliary-machine behaviour, not a station's. As a station, it adds a 120 s queue per batch that has no physical counterpart.

## Validation plan

1. **Model role.** Data: the station's control philosophy. Test: should the panel be an auxiliary machine needed by the pumps, rather than a station on the flow? Proposed acceptance: the twin's role matches what the panel does.
2. **Class choice and range check.** As for [../boiler/control-panel.md](../boiler/control-panel.md), plans 1 and 2.
3. **Real plant data.** Data: SCADA alarm and event log (PLC faults, communication losses) and work orders for two or more years. Test: panel-caused stops per hour and their durations against MTBF and MTTR. Proposed acceptance: inside the 90% confidence intervals of the plant's rates.
