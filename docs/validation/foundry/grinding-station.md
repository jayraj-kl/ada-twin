# Grinding station (Foundry)

Machine `foundry-3` · count 1 · station · sample `foundry`. Method and source IDs: [../README.md](../README.md).

## Equipment class

**Manual weld-dressing grinding station**: a bench or floor position where welded parts are ground with portable angle grinders or a pedestal grinder, usually with dust extraction. Parts are also "inspected" here per the process text; the sim has no separate inspection machine in this sample.

## What the sim uses today

| Parameter            | Value in the sample   | Where it comes from                         |
| -------------------- | --------------------- | ------------------------------------------- |
| `units`              | 1                     | `sample.ts` (user input)                    |
| `cycleTime`          | 120 s per part        | Hard-coded fallback, provenance `assumed`   |
| `cycleTimeVariation` | 0.25                  | Hard-coded fallback, `assumed`              |
| `mtbf`               | 4 h of working time   | Hard-coded fallback, `assumed`              |
| `mttr`               | 20 min (0.33 h)       | Hard-coded fallback, `assumed`              |
| `scrapRate`          | 0.01                  | Hard-coded fallback, `assumed`              |
| Uptime (derived)     | 0.923; 0.908 at 34 °C | MTBF / (MTBF + MTTR)                        |

With one unit, this is the sample's bottleneck: 221.5 parts per shift (**Derived**, see [README.md](README.md)).

## Published baseline

| Parameter                 | Published value                 | Source |
| ------------------------- | ------------------------------- | ------ |
| MTBF, MTTR, availability  | not found in a verified source  | –      |
| Grinding time per part    | not found in a verified source  | –      |

A station of hand tools rarely stops for a tool failure, since a spare grinder is swapped in (**Inference**). Its stoppages are more likely to be disc changes and the operator's breaks, neither of which the sim's failure model is meant for.

## Comparison

| Parameter    | Sim             | Baseline                        | Status             |
| ------------ | --------------- | ------------------------------- | ------------------ |
| MTBF         | 4 h (working)   | not found in a verified source  | not yet comparable |
| MTTR         | 0.33 h          | not found in a verified source  | not yet comparable |
| Availability | 0.923           | not found in a verified source  | not yet comparable |
| Cycle time   | 120 s per part  | not found in a verified source  | not yet comparable |
| Cycle-time variation, scrap | 0.25, 0.01 | not found in a verified source | not yet comparable |

## Validation plan

1. **Time study (real plant data).** Data: at least 50 timed parts, from pick-up to set-down, with stoppages noted by cause. Test: mean and coefficient of variation against `cycleTime` and `cycleTimeVariation`; two-sample Kolmogorov–Smirnov test against the kernel's log-normal. Proposed acceptance: mean within ±10%, coefficient of variation within ±0.1, KS not rejected at the 5% level.
2. **Stoppage model.** From the same study, separate disc changes and tool swaps from true breakdowns. If breakdowns are rare, set `mtbf` from them and record disc changes as part of the cycle time. Proposed acceptance: the twin's down share per shift within the 90% interval of the observed.
3. **Scrap.** Count parts rejected at grinding or inspection over four weeks against `scrapRate`. Proposed acceptance: twin rate inside the 90% binomial interval of the observed rate.
