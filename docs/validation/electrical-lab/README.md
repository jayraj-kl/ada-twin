# Electrical lab: validation notes

Sample slug `electrical-lab`. Unit of work: **motors**. Sources and method: [../README.md](../README.md). Read on 2026-11-20.

## Process flow

As given in `apps/frontend/src/twin/sample.ts`:

> Electric motors come in from stores and wait at intake. They are stripped and rewound at the workbenches, then run up on the test stands with the motor-generator sets. Motors that pass are checked at the instrument panel and leave at dispatch.

```
stores → intake → Rewinding workbenches ×6 → Motor test stands ×4 → Instrument panel ×1 → dispatch
```

No auxiliary machine is listed. The motor-generator sets are named in the text as part of the test stands. Links and buffers are drafted at runtime by the flow-drafter agent and corrected by the user; the sketch is the likely draft (**Inference**). "Motors that pass" implies a failed test sends a motor back for rework; the sim has no rework loop unless the user draws one, and `scrapRate` removes failures instead.

## What it counts

The plant counts **motors** repaired. Unlike the other samples, the unit of work is a physical object. Its size (frame, kW, number of coils) is not defined, and rewinding time varies with it.

## Machines

| Id                 | Machine                                          | Count | Role    | Equipment class                                   | Baseline found  |
| ------------------ | ------------------------------------------------ | ----: | ------- | ------------------------------------------------- | --------------- |
| `electrical-lab-1` | [Rewinding workbenches](rewinding-workbenches.md) |    6 | station | Manual motor stripping and rewinding bench        | none verified   |
| `electrical-lab-2` | [Motor test stands](motor-test-stands.md)        |     4 | station | Motor test stand with motor-generator set         | S1 Motor Generator Set |
| `electrical-lab-3` | [Instrument panel](instrument-panel.md)          |     1 | station | Test and measurement instrument panel             | S1 Control Panel, Control System (proxy) |

## Plant-level figures (Derived, not a sim run)

All machines open on the fallbacks: cycle 120 s, MTBF 4 h, MTTR 20 min, uptime 0.923.

- The single Instrument panel unit can finish 221.5 motors per shift if every motor passes it once. It sets the plant's capacity; the six workbenches could finish 1,329 and the four test stands 886 at the same fallback figures.
- The default scenario is sized at demand **240** and target **200** motors per shift, at 34 °C. That is one rewound motor every 2 minutes per workbench, which is not a plausible rewind time for any motor (**Inference**; no verified rewind time was found).
