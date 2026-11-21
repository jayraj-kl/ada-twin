# Cutting tables (Foundry)

Machine `foundry-1` · count 3 · station · sample `foundry`. Method and source IDs: [../README.md](../README.md).

## Equipment class

**CNC thermal cutting table** (plasma or oxy-fuel) cutting steel plate and pipe into pieces. The panorama does not show which process. Both are gantry machines with a torch, a CNC controller and fume extraction.

## What the sim uses today

| Parameter            | Value in the sample   | Where it comes from                         |
| -------------------- | --------------------- | ------------------------------------------- |
| `units`              | 3                     | `sample.ts` (user input)                    |
| `cycleTime`          | 120 s per part        | Hard-coded fallback, provenance `assumed`   |
| `cycleTimeVariation` | 0.25                  | Hard-coded fallback, `assumed`              |
| `mtbf`               | 4 h of working time   | Hard-coded fallback, `assumed`              |
| `mttr`               | 20 min (0.33 h)       | Hard-coded fallback, `assumed`              |
| `scrapRate`          | 0.01                  | Hard-coded fallback, `assumed`              |
| Uptime (derived)     | 0.923; 0.908 at 34 °C | MTBF / (MTBF + MTTR)                        |

Researched values, once a manufacturer and model or a manual is added, are AI-drafted at runtime with provenance and are not fixed in code.

## Published baseline

| Parameter                      | Published value                    | Source |
| ------------------------------ | ---------------------------------- | ------ |
| MTBF, failure rate             | not found in a verified source     | –      |
| MTTR                           | not found in a verified source     | –      |
| Availability                   | not found in a verified source     | –      |
| Cutting speed / cycle per part | not found in a verified source     | –      |

S2 reports field reliability for CNC turning centres. A cutting table shares the CNC controller and axis drives but not the spindle, turret or chuck, so S2 is not used here. Plasma torch consumable life (electrode and nozzle starts) appears in manufacturers' cut charts, but none was read and verified for this note.

## Comparison

| Parameter    | Sim             | Baseline                        | Status             |
| ------------ | --------------- | ------------------------------- | ------------------ |
| MTBF         | 4 h (working)   | not found in a verified source  | not yet comparable |
| MTTR         | 0.33 h          | not found in a verified source  | not yet comparable |
| Availability | 0.923           | not found in a verified source  | not yet comparable |
| Cycle time   | 120 s per part  | not found in a verified source  | not yet comparable |
| Cycle-time variation, scrap | 0.25, 0.01 | not found in a verified source | not yet comparable |

A 4 h MTBF (two failures per table per shift) may be closer to reality here than for pumps if consumable changes are counted as failures (**Inference**, untested). If so, they would be better modelled as short planned stops than as random failures.

## Validation plan

1. **Find a baseline.** Search OREDA@cloud (S6) and manufacturers' service data for CNC cutting machines; read the torch manufacturer's cut chart for the plate thickness in use, recording consumable life in starts and cut speed. Record only figures read from the document.
2. **Define a part.** Agree with the user a reference part (plate thickness, cut length, pierce count). Then cycle time = cut length / cut speed + pierces × pierce time + handling, from the cut chart.
3. **Real plant data.** Data: the CNC controller's job log (start, end, alarms) for at least four weeks. Test: (a) the distribution of job times against the kernel's log-normal (two-sample Kolmogorov–Smirnov); (b) alarm stops per running hour against 1 / MTBF; (c) alarm duration against MTTR. Proposed acceptance: KS not rejected at the 5% level; MTBF and MTTR within the 90% confidence intervals of the logged rates.
