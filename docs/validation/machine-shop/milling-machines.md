# Milling machines (Machine shop)

Machine `machine-shop-2` · count 2 · station · sample `machine-shop`. Method and source IDs: [../README.md](../README.md).

## Equipment class

**Milling machine** (bed or knee type, CNC or manual) machining faces and features on large castings. No public field reliability data for milling machines was found. S2 (CNC turning centres) is used as a **proxy class**, as for the [Boring mill](boring-mill.md). For milling specifically, the NASA PCoE "Milling" and "CNC Milling Machine" datasets (S9) are real measurements of cutter wear, though not of machine failures.

## What the sim uses today

| Parameter            | Value in the sample   | Where it comes from                         |
| -------------------- | --------------------- | ------------------------------------------- |
| `units`              | 2                     | `sample.ts` (user input)                    |
| `cycleTime`          | 120 s per casting     | Hard-coded fallback, provenance `assumed`   |
| `cycleTimeVariation` | 0.25                  | Hard-coded fallback, `assumed`              |
| `mtbf`               | 4 h of working time   | Hard-coded fallback, `assumed`; Weibull shape 2 |
| `mttr`               | 20 min (0.33 h)       | Hard-coded fallback, `assumed`; exponential |
| `scrapRate`          | 0.01                  | Hard-coded fallback, `assumed`              |
| Uptime (derived)     | 0.923; 0.908 at 34 °C | MTBF / (MTBF + MTTR)                        |

## Published baseline

S2 (proxy class, CNC turning centres; **Verified**): MTBF "nearly 2000 hrs"; failure-time shape "nearly equal to 1"; failure and repair rates "nearly constant"; steady-state availability 0.9063, "from 0.922 to 0.8882 … for 90% confidence level". Details and caveats in [boring-mill.md](boring-mill.md).

S9, NASA PCoE Data Set Repository (**Verified** as listed):

| Dataset                 | Description on the repository page                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| Milling                 | "Experiments on a milling machine for different speeds, feeds, and depth of cut."          |
| CNC Milling Machine     | Cutter remaining useful life from dynamometer, accelerometer and acoustic emission data; 2010 PHM Society Data Competition |

| Parameter                     | Published value                 | Source |
| ----------------------------- | ------------------------------- | ------ |
| Milling time per casting      | not found in a verified source  | –      |
| Machine-level MTTR            | not found in a verified source  | –      |

## Comparison

| Parameter        | Sim                     | Baseline (proxy class)          | Status                                   |
| ---------------- | ----------------------- | ------------------------------- | ---------------------------------------- |
| MTBF             | 4 h (working)           | about 2000 h                    | outside range                            |
| Failure shape    | Weibull shape 2         | shape ≈ 0.9                     | outside range                            |
| Repair shape     | exponential             | "nearly constant" repair rate   | within range                             |
| Availability     | 0.923 (0.908 at 34 °C)  | 0.8882–0.922                    | outside range at 25 °C (just above); within range at 34 °C |
| MTTR             | 0.33 h                  | not read as a single figure     | not yet comparable                       |
| Cycle time       | 120 s per casting       | not found in a verified source  | not yet comparable                       |
| Cycle-time variation, scrap | 0.25, 0.01   | not found in a verified source  | not yet comparable                       |

## Validation plan

1. **Tool wear from public real data.** Data: Milling and CNC Milling Machine sets (S9). Test: derive cutter life (cutting time until the wear limit the dataset uses) and its spread. Decide whether a tool change is a planned stop inside the cycle time or a failure. Proposed acceptance: the chosen model's predicted tool changes per shift within ±20% of the dataset's, at the dataset's cutting conditions.
2. **Kernel check.** Isolated station of 2 units, kept busy, two crews, horizon at least 1,000 × MTBF. Test: down share against MTTR / (MTBF + MTTR) per unit. Proposed acceptance: within ±10%.
3. **Real plant data.** Data: CNC alarm logs, work orders and spindle-on hours for both machines over two or more years; program run times per casting. Test and acceptance as in [boring-mill.md](boring-mill.md), plan 4. Check also that the two machines behave alike, since the sim treats them as identical units.
