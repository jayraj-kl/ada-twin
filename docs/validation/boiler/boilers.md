# Boilers (Boiler room)

Machine `boiler-2` · count 2 · station · sample `boiler`. Method and source IDs: [../README.md](../README.md).

## Equipment class

**Industrial steam boiler**, gas fired (it needs the gas valve trains). The closest public class is S1 "Boiler / Steam" (H8-200), split into "High Pressure" (H8-210) and "Low Pressure" (H8-220). The panorama does not tell which pressure class these are, so both are kept.

NERC GADS (S8) holds outage data for utility generating units of 20 MW and up. A utility steam unit is a whole power station unit, not a boiler-room boiler, so it was not used.

## What the sim uses today

| Parameter            | Value in the sample   | Where it comes from                         |
| -------------------- | --------------------- | ------------------------------------------- |
| `units`              | 2                     | `sample.ts` (user input)                    |
| `cycleTime`          | 120 s per batch       | Hard-coded fallback, provenance `assumed`   |
| `cycleTimeVariation` | 0.25                  | Hard-coded fallback, `assumed`              |
| `mtbf`               | 4 h of working time   | Hard-coded fallback, `assumed`              |
| `mttr`               | 20 min (0.33 h)       | Hard-coded fallback, `assumed`              |
| `scrapRate`          | 0.01                  | Hard-coded fallback, `assumed`              |
| Uptime (derived)     | 0.923; 0.908 at 34 °C | MTBF / (MTBF + MTTR)                        |

The Boilers also stop whenever a gas valve train is down, if the drafted flow links them (see [gas-valve-trains.md](gas-valve-trains.md)). Researched values, when the user gives a model or a manual, are AI-drafted at runtime with provenance and are not fixed in code.

## Published baseline

S1 = TM 5-698-5, Appendix B, page B-2. Calendar-time MTBF.

| Class (item)              | Unit-years | Failures | MTBF (h)   | MTTR (h) | Inherent availability | Operational availability |
| ------------------------- | ---------: | -------: | ---------: | -------: | --------------------: | -----------------------: |
| Boiler (H8-000)           |     1113.0 |      144 |  67,708.83 |    43.29 |           0.999360697 |              0.995132436 |
| Hot Water (H8-100)        |      358.4 |       15 | 209,292.8  |     3.08 |           0.999985268 |              0.999501894 |
| Steam (H8-200)            |      754.6 |      129 |  51,245.58 |    47.96 |           0.999064090 |              0.993057393 |
| Steam, High Pressure (H8-210) |  468.6 |       35 | 117,277.7  |    44.63 |           0.999619462 |              0.991492148 |
| Steam, Low Pressure (H8-220)  |  286.1 |       94 |  26,659.1  |    49.20 |           0.998154400 |              0.995621239 |

- **Cycle time / throughput:** not found in a verified source for a "batch". Published boiler figures are in steam output and efficiency, which the sim does not model.

## Comparison

| Parameter    | Sim                 | Baseline (steam sub-classes)                                         | Status             |
| ------------ | ------------------- | -------------------------------------------------------------------- | ------------------ |
| MTBF         | 4 h (working)       | 26,659.1–117,277.7 h calendar; ≈6,330–27,850 h at 0.237 duty (Derived) | outside range      |
| MTTR         | 0.33 h              | 44.63–49.20 h                                                        | outside range      |
| Availability | 0.923               | Ai 0.998154400–0.999619462                                           | outside range      |
| Cycle time   | 120 s per batch     | not found in a verified source                                       | not yet comparable |
| Cycle-time variation, scrap | 0.25, 0.01 | not found in a verified source                                | not yet comparable |

A boiler repair in S1 averages 43 to 49 hours, several 8-hour shifts. The sim's 20-minute repair makes "faster repairs" and "an extra maintenance crew" look cheap to reach for this machine (**Inference**).

## Validation plan

1. **Parameter range check.** Data: S1 B-2 rows above. Test: the boiler's MTBF and MTTR, converted to an operating basis with the plant's firing hours, against the steam sub-class range. Proposed acceptance: inside 26,659.1–117,277.7 h (scaled to the plant's duty) for MTBF and 44.63–49.20 h for MTTR, or a cited document for the difference.
2. **Kernel check.** Isolated Boilers station, kept busy, one crew per unit, horizon at least 1,000 × MTBF, with H8-200's MTBF and MTTR. Proposed acceptance: simulated down share within ±10% of MTTR / (MTBF + MTTR) = 0.000936 (**Derived** from 1 − 0.999064090).
3. **Real plant data.** Data: boiler log and work orders for two or more years (trips, forced outages, return to service), and firing hours. Test: plant MTBF and MTTR against S1, then 60 days of the twin against the plant's recorded boiler downtime per shift. Proposed acceptance: observed down share per shift inside the 5th–95th percentile band of the simulated days.
4. **Define the unit of work first.** Before any cycle-time test, define a batch (for example a fixed steam mass). Then a cycle time can be derived from the boiler's rated output on its datasheet and compared.
