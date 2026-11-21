# Overhead crane (Foundry)

Machine `foundry-4` · count 1 · **auxiliary** · sample `foundry`. Method and source IDs: [../README.md](../README.md).

## Equipment class

**Top-running overhead bridge crane** with an electric hoist. S4 quotes CMAA 70: Class D (Heavy-Duty) "covers cranes which may be used in heavy machine shop, foundries, fabricating plants, steel warehouses". A fabrication floor of this size may instead be Class C (Moderate). The crane's class plate or purchase specification would settle it.

## What the sim uses today

| Parameter | Value in the sample   | Where it comes from                                         |
| --------- | --------------------- | ----------------------------------------------------------- |
| `units`   | 1                     | `sample.ts` (user input)                                    |
| `spares`  | none                  | Not set                                                     |
| `mtbf`    | 4 h of working time   | Hard-coded fallback, provenance `assumed`                   |
| `mttr`    | 20 min (0.33 h)       | Hard-coded fallback, `assumed`                              |
| Needed by | Drafted at runtime    | Flow-drafter links it to what stops when it is down, likely the source or stock bay feed (**Inference**) |

An auxiliary machine has no cycle time, so the sim models the crane's failures but not its capacity: however many parts arrive, the crane never queues them.

## Published baseline

S4, UFGS-41 22 13.14 (November 2019, Change 1 02/21), quoting CMAA 70 (**Verified**):

| CMAA 70 class          | Lifts per hour | Load pattern (as quoted)                                                                     |
| ---------------------- | -------------: | -------------------------------------------------------------------------------------------- |
| B, Light Service       |          2–5 | "Loads may vary from no load to occasional full rated loads"                                  |
| C, Moderate Service    |         5–10 | "loads which average 50 percent of the rated capacity"                                        |
| D, Heavy-Duty          |        10–20 | "loads approaching 50 percent of the rated capacity will be handled constantly"               |
| E, Severe Service      |    20 or more | "at or near the rated capacity"                                                              |

| Parameter                 | Published value                 | Source |
| ------------------------- | ------------------------------- | ------ |
| MTBF, MTTR, availability  | not found in a verified source  | –      |

S1 has no crane or hoist class.

## Comparison

| Parameter      | Sim                 | Baseline                        | Status             |
| -------------- | ------------------- | ------------------------------- | ------------------ |
| MTBF           | 4 h (working)       | not found in a verified source  | not yet comparable |
| MTTR           | 0.33 h              | not found in a verified source  | not yet comparable |
| Availability   | 0.923               | not found in a verified source  | not yet comparable |
| Lifts per hour | not modelled        | 10–20 (Class D), 5–10 (Class C) | not yet comparable |

**Capacity check (Derived and Inference).** The default scenario asks for about 240 parts per 8-hour shift, 30 per hour (see [README.md](README.md)). If each part needs one lift in, that is above the top of Class D (20 per hour) and three times the top of Class C. If pieces come in bundles of plate, the lift count is lower. The sim cannot tell, because the crane has no throughput.

## Validation plan

1. **Class and lift count.** Data: the crane's CMAA class from its nameplate or specification, and the number of lifts a part needs (from the user). Test: required lifts per hour at the scenario's demand against the class's lifts per hour (S4). Proposed acceptance: required lifts at or below the class's upper bound; otherwise flag the scenario as beyond the crane's duty.
2. **Model gap.** If the check fails, the crane should be modelled as a station with a cycle time (lift time) on the delivery path, not only as an auxiliary machine. This is a modelling change for the team to decide; it is not made here.
3. **Reliability (real plant data).** Data: the crane's inspection and repair records (periodic inspections, and breakdown work orders) for two or more years, with operating hours from the hour meter if fitted. S4 references ASME B30.2 for overhead cranes, which is where inspection records usually come from. Test: breakdowns per operating hour against 1 / MTBF; repair durations against MTTR. Proposed acceptance: twin values inside the 90% confidence intervals of the recorded rates.
4. **Published source still to find.** Whether OREDA@cloud (S6) or IEEE 3006.8 (S7) carries crane or hoist data was not checked. No public crane MTBF or MTTR was found.
