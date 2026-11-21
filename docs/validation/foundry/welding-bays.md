# Welding bays (Foundry)

Machine `foundry-2` · count 4 · station · sample `foundry`. Method and source IDs: [../README.md](../README.md).

## Equipment class

**Manual or semi-automatic arc welding station**: a screened bay with a welding power source, torch or electrode holder, fume extraction and a welder. The panorama does not show whether MMA (stick) or MIG/MAG (wire) is used.

## What the sim uses today

| Parameter            | Value in the sample   | Where it comes from                         |
| -------------------- | --------------------- | ------------------------------------------- |
| `units`              | 4                     | `sample.ts` (user input)                    |
| `cycleTime`          | 120 s per part        | Hard-coded fallback, provenance `assumed`   |
| `cycleTimeVariation` | 0.25                  | Hard-coded fallback, `assumed`              |
| `mtbf`               | 4 h of working time   | Hard-coded fallback, `assumed`              |
| `mttr`               | 20 min (0.33 h)       | Hard-coded fallback, `assumed`              |
| `scrapRate`          | 0.01                  | Hard-coded fallback, `assumed`              |
| Uptime (derived)     | 0.923; 0.908 at 34 °C | MTBF / (MTBF + MTTR)                        |

The sim's cycle time is the whole time a bay is busy with one part. It has no separate arc time, set-up or fitting.

## Published baseline

S3, TWI Job Knowledge 96 "Welding costs" (**Verified**). The "duty cycle" or "operating factor" is "a percentage figure giving the amount of time that the arc is burning":

| Process               | Arc-on duty cycle |
| --------------------- | ----------------: |
| MMA (SMAW)            |          15–30 % |
| MIG/MAG (GMAW)        |          30–45 % |
| Mechanised MIG/MAG    |          80–90 % |

S3 adds: "Note that these do NOT include set-up or assembly time".

| Parameter                         | Published value                 | Source |
| --------------------------------- | ------------------------------- | ------ |
| Power source MTBF, MTTR           | not found in a verified source  | –      |
| Bay availability                  | not found in a verified source  | –      |
| Weld time per part                | not found in a verified source  | –      |

## Comparison

| Parameter        | Sim             | Baseline                                         | Status             |
| ---------------- | --------------- | ------------------------------------------------ | ------------------ |
| MTBF             | 4 h (working)   | not found in a verified source                   | not yet comparable |
| MTTR             | 0.33 h          | not found in a verified source                   | not yet comparable |
| Availability     | 0.923           | not found in a verified source                   | not yet comparable |
| Cycle time       | 120 s per part  | arc time per part not defined; duty 15–45 % manual (S3) | not yet comparable |
| Cycle-time variation, scrap | 0.25, 0.01 | not found in a verified source             | not yet comparable |

How S3 would enter once a part is defined (**Inference**): if a part needs t seconds of arc time, a manual bay is busy for roughly t / 0.15 to t / 0.45 seconds per part (MMA to MIG/MAG), before set-up. For example, 60 s of arc time would mean roughly 133–400 s per part. This is a sizing rule, not a check of the 120 s fallback.

## Validation plan

1. **Define a part and its welds.** Weld length, size and process per part, from the user's drawings or procedure (WPS). Arc time = weld metal mass / deposition rate, both from the procedure or consumable datasheet.
2. **Cycle-time check.** Test: twin `cycleTime` against arc time / S3 duty cycle for the process. Proposed acceptance: inside the range given by the S3 duty-cycle bounds for that process.
3. **Real plant data.** Data: arc-on records, where the power source or a monitoring add-on keeps them, or a time study of at least 50 parts. Test: measured duty cycle against S3, and measured part times against the kernel's log-normal (mean ±10%, coefficient of variation ±0.1). Stoppages logged for wire feed, torch or power source faults give MTBF and MTTR.
