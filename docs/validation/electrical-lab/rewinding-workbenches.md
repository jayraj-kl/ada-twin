# Rewinding workbenches (Electrical lab)

Machine `electrical-lab-1` · count 6 · station · sample `electrical-lab`. Method and source IDs: [../README.md](../README.md).

## Equipment class

**Manual motor stripping and rewinding bench**: a bench with coil winding machine, coil formers, insulation and varnish materials and hand tools, worked by a winder. Stripping, winding, connecting, varnishing and curing are all folded into one station in the sim.

## What the sim uses today

| Parameter            | Value in the sample   | Where it comes from                         |
| -------------------- | --------------------- | ------------------------------------------- |
| `units`              | 6                     | `sample.ts` (user input)                    |
| `cycleTime`          | 120 s per motor       | Hard-coded fallback, provenance `assumed`   |
| `cycleTimeVariation` | 0.25                  | Hard-coded fallback, `assumed`              |
| `mtbf`               | 4 h of working time   | Hard-coded fallback, `assumed`              |
| `mttr`               | 20 min (0.33 h)       | Hard-coded fallback, `assumed`              |
| `scrapRate`          | 0.01                  | Hard-coded fallback, `assumed`              |
| Uptime (derived)     | 0.923; 0.908 at 34 °C | MTBF / (MTBF + MTTR)                        |

## Published baseline

| Parameter                        | Published value                 | Source |
| -------------------------------- | ------------------------------- | ------ |
| Bench or winding machine MTBF, MTTR | not found in a verified source | –      |
| Rewind time per motor            | not found in a verified source  | –      |
| Variation in rewind time         | not found in a verified source  | –      |

S1 has no class for winding machines or manual workbenches.

## Comparison

| Parameter    | Sim                 | Baseline                        | Status             |
| ------------ | ------------------- | ------------------------------- | ------------------ |
| MTBF         | 4 h (working)       | not found in a verified source  | not yet comparable |
| MTTR         | 0.33 h              | not found in a verified source  | not yet comparable |
| Availability | 0.923               | not found in a verified source  | not yet comparable |
| Cycle time   | 120 s per motor     | not found in a verified source  | not yet comparable |
| Cycle-time variation, scrap | 0.25, 0.01 | not found in a verified source | not yet comparable |

Two things here are likely wrong in kind, not only in value (**Inference**, untested): a rewind takes far longer than 2 minutes, and its spread across motor sizes is far wider than a 0.25 coefficient of variation. The varnish cure, often an oven bake, is waiting time rather than bench time and would be better modelled as a buffer.

## Validation plan

1. **Define the motor mix.** Data: the shop's job records for the last year (frame size, kW, poles). Test: group into two or three size classes; consider one unit of work per class.
2. **Rewind time (real plant data).** Data: job cards with bench hours per motor for at least 50 motors. Test: mean, coefficient of variation and distribution shape against `cycleTime`, `cycleTimeVariation` and the kernel's log-normal (two-sample Kolmogorov–Smirnov). Proposed acceptance: mean within ±10%, coefficient of variation within ±0.1, KS not rejected at the 5% level. If the mix is too wide for one log-normal, split the unit of work.
3. **Stoppages.** Data: the same records, noting winding machine faults and waiting for materials. Decide whether the bench needs a failure model; a missing-material wait is closer to a supply loss in the scenario than a failure.
4. **Scrap and rework.** Data: test-stand failures sent back to a bench. Test: rework rate against `scrapRate`. Proposed acceptance: if most failed motors are reworked, model a rework link rather than scrap.
