# Foundry: validation notes

Sample slug `foundry`. Unit of work: **parts**. Sources and method: [../README.md](../README.md). Read on 2026-11-20.

## Process flow

As given in `apps/frontend/src/twin/sample.ts`:

> Steel plate and pipe come in by the overhead crane and wait in the stock bay. Pieces are cut at the cutting tables, fitted, and welded in the screened welding bays. Welded parts cool on a rack, are ground and inspected, and leave at dispatch.

```
crane delivery → stock bay → Cutting tables ×3 → Welding bays ×4 → cooling rack → Grinding station ×1 → dispatch
      ▲
Overhead crane ×1 (auxiliary)
```

Despite its name, this sample is a steel fabrication floor (cutting, fitting, welding, grinding), not a casting foundry. Links, buffers and which machines need the crane are drafted at runtime by the flow-drafter agent and corrected by the user; the sketch is the likely draft (**Inference**). Fitting and inspection are named in the process text but are not machines, so the sim does not model them.

## What it counts

The plant counts **parts**: welded fabrications of no defined size, weld length or number of cuts. Cycle times cannot be checked against cutting speeds or weld deposition rates until a part is defined.

## Machines

| Id          | Machine                                | Count | Role      | Equipment class                                    | Baseline found |
| ----------- | -------------------------------------- | ----: | --------- | -------------------------------------------------- | -------------- |
| `foundry-1` | [Cutting tables](cutting-tables.md)    |     3 | station   | CNC plasma or oxy-fuel cutting table               | none verified  |
| `foundry-2` | [Welding bays](welding-bays.md)        |     4 | station   | Manual or semi-automatic arc welding station       | arc-on duty cycle only (S3) |
| `foundry-3` | [Grinding station](grinding-station.md) |    1 | station   | Manual weld-dressing grinding station              | none verified  |
| `foundry-4` | [Overhead crane](overhead-crane.md)    |     1 | auxiliary | Top-running overhead bridge crane, CMAA 70 Class C–D | lifts per hour only (S4) |

## Plant-level figures (Derived, not a sim run)

All machines open on the fallbacks: cycle 120 s, MTBF 4 h, MTTR 20 min, uptime 0.923.

- The single Grinding station unit can finish 221.5 parts per shift if every part passes it once. It sets the plant's capacity; the cutting tables (3 units) and welding bays (4 units) have three and four times as much.
- The default scenario is then sized at demand **240** and target **200** parts per shift, at 34 °C.
- 240 parts in 8 hours is 30 per hour. CMAA 70 Class D cranes, the class named for foundries and fabricating plants, are specified for 10 to 20 lifts per hour (S4). If each part arrives by one crane lift, the crane could not keep up (**Inference**). The sim does not model crane capacity, so it would not show this.

For this plant no machine has a verified MTBF or MTTR baseline. It is the least validated of the five samples.
