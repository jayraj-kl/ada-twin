# Boiler room: validation notes

Sample slug `boiler`. Unit of work: **batches**. Sources and method: [../README.md](../README.md). Read on 2026-11-20.

## Process flow

As given in `apps/frontend/src/twin/sample.ts`:

> Batches come in at the intake and wait on a staging rack. They go through the feed pumps, queue at the header, and are heated in the boilers. After the boilers they wait in an inspection hold, are checked at the control panel, and leave at dispatch.

```
intake → staging rack → Feed pumps ×2 → header → Boilers ×2 → inspection hold → Control panel ×1 → dispatch
                                                   ▲
                                 Gas valve trains ×2 (auxiliary)
```

The links, buffers and which machines need the gas valve trains are drafted at runtime by the flow-drafter agent from the panorama and this text, then corrected by the user. The sketch above is the likely draft (**Inference**), not a fixed structure. A drafted source with no value releases one batch every 90 s, and a drafted buffer with no value holds 6 batches (`EXTRA_DEFAULTS` in `apps/frontend/src/twin/flow.ts`); the scenario then resets the release rate to its demand.

## What it counts

The plant counts **batches**. A batch has no defined volume, mass or heat duty, so a boiler's "cycle time per batch" has no physical counterpart in published boiler data. Cycle time is **not yet comparable** for every machine here.

## Machines

| Id         | Machine                                    | Count | Role      | Equipment class                                          | Baseline found        |
| ---------- | ------------------------------------------ | ----: | --------- | -------------------------------------------------------- | --------------------- |
| `boiler-1` | [Feed pumps](feed-pumps.md)                |     2 | station   | Boiler feedwater centrifugal pump                        | S1 Pump               |
| `boiler-2` | [Boilers](boilers.md)                      |     2 | station   | Industrial steam boiler (packaged, low or high pressure) | S1 Boiler             |
| `boiler-3` | [Control panel](control-panel.md)          |     1 | station   | Boiler control panel / burner management cabinet         | S1 Control Panel, Control System |
| `boiler-4` | [Gas valve trains](gas-valve-trains.md)    |     2 | auxiliary | Fuel gas valve train (shut-off valves, regulator, switches) | S1 Valve Operator, Pressure Control Assembly; S5 |

## Plant-level figures (Derived, not a sim run)

All four machines open on the fallbacks: cycle 120 s, MTBF 4 h, MTTR 20 min, uptime 0.923.

- One Control panel unit can finish 8 h × 3,600 s × 0.923 / 120 s = **221.5 batches per shift**, if every batch passes it once. It has one unit; the other stations have two, so it sets the plant's capacity in `shiftCapacity()`.
- `plantScenario()` then sizes the default scenario at 110% and 90% of that, rounded: demand **240** and target **200** batches per shift, at 34 °C.
- At 34 °C the fallback MTBF is 3.28 h, so each working unit expects about 2.4 failures per 8-hour shift.

Published boiler-room figures (S1) put a steam boiler at one failure per 26,659.1 to 117,277.7 calendar hours. The sample's failure pattern is the main thing a validation would change here.
