# Overhead crane (Machine shop)

Machine `machine-shop-5` · count 1 · **auxiliary** · sample `machine-shop`. Method and source IDs: [../README.md](../README.md).

## Equipment class

**Top-running overhead bridge crane** handling large castings in and out. S4 quotes CMAA 70: Class C (Moderate Service) "covers cranes which may be used in machine shops of paper mill machine rooms"; Class D (Heavy-Duty) covers "heavy machine shop, foundries, fabricating plants". For large castings, Class D is the likelier match (**Inference**); the crane's nameplate or specification settles it.

## What the sim uses today

| Parameter | Value in the sample   | Where it comes from                                         |
| --------- | --------------------- | ----------------------------------------------------------- |
| `units`   | 1                     | `sample.ts` (user input)                                    |
| `spares`  | none                  | Not set                                                     |
| `mtbf`    | 4 h of working time   | Hard-coded fallback, provenance `assumed`                   |
| `mttr`    | 20 min (0.33 h)       | Hard-coded fallback, `assumed`                              |
| Needed by | Drafted at runtime    | Flow-drafter links it to what stops when it is down, likely the incoming source and possibly the Boring mill, where castings are loaded (**Inference**) |

An auxiliary machine has no cycle time. The sim models the crane's failures, not its lifts.

## Published baseline

S4, UFGS-41 22 13.14 (November 2019, Change 1 02/21), quoting CMAA 70 (**Verified**):

| CMAA 70 class        | Lifts per hour | Typical use (as quoted)                                   |
| -------------------- | -------------: | --------------------------------------------------------- |
| C, Moderate Service  |           5–10 | "machine shops of paper mill machine rooms"               |
| D, Heavy-Duty        |          10–20 | "heavy machine shop, foundries, fabricating plants"       |

| Parameter                 | Published value                 | Source |
| ------------------------- | ------------------------------- | ------ |
| MTBF, MTTR, availability  | not found in a verified source  | –      |

## Comparison

| Parameter      | Sim                 | Baseline                        | Status             |
| -------------- | ------------------- | ------------------------------- | ------------------ |
| MTBF           | 4 h (working)       | not found in a verified source  | not yet comparable |
| MTTR           | 0.33 h              | not found in a verified source  | not yet comparable |
| Availability   | 0.923               | not found in a verified source  | not yet comparable |
| Lifts per hour | not modelled        | 5–10 (Class C), 10–20 (Class D) | not yet comparable |

**Capacity check (Derived and Inference).** The default scenario asks for about 240 castings per shift, 30 per hour (see [README.md](README.md)). Large castings are usually lifted at least twice (in, and onto the first machine) (**Inference**), which would mean 60 or more lifts per hour, three times the top of Class D. Either the scenario's demand is far above what this floor can do, or the crane is a hidden bottleneck the sim does not show.

## Validation plan

1. **Lift count and class.** Data: the crane's CMAA class, and the lifts each casting needs, from the user. Test: lifts per hour at the scenario's demand against the class (S4). Proposed acceptance: at or below the class's upper bound; otherwise flag the scenario.
2. **Model gap.** If lifts per hour bind, model the crane as a station on the delivery path with a lift cycle time. A modelling decision for the team; not made here.
3. **Reliability (real plant data).** Data: inspection and breakdown records for two or more years, and hour-meter readings. Proposed acceptance: twin MTBF and MTTR inside the 90% confidence intervals of the recorded rates.
4. **Published source still to find.** No public crane or hoist MTBF or MTTR was found; S1 has no crane class.
