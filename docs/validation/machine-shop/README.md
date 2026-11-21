# Machine shop: validation notes

Sample slug `machine-shop`. Unit of work: **castings**. Sources and method: [../README.md](../README.md). Read on 2026-11-20.

## Process flow

As given in `apps/frontend/src/twin/sample.ts`:

> Large castings come in by the overhead crane and wait on the floor. They are machined on the boring and milling machines, then drilled. Parts queue for deburring, are measured at the inspection bench, and leave through the loading door.

```
crane delivery → floor → Boring mill ×1 → Milling machines ×2 → Radial drill ×1 → deburring queue → Inspection bench ×1 → loading door
      ▲
Overhead crane ×1 (auxiliary)
```

Whether the boring mill and the milling machines run in series or as alternatives ("machined on the boring and milling machines") is left to the flow-drafter agent and the user. The sketch shows series (**Inference**). Deburring is named but is not a machine, so the sim does not model it.

## What it counts

The plant counts **castings**, called "large" in the process text, with no defined size, features or machining time. Cycle times cannot be checked until a reference casting is defined.

## Machines

| Id               | Machine                                    | Count | Role      | Equipment class                                  | Baseline found            |
| ---------------- | ------------------------------------------ | ----: | --------- | ------------------------------------------------ | ------------------------- |
| `machine-shop-1` | [Boring mill](boring-mill.md)              |     1 | station   | Horizontal boring mill (CNC or manual)           | S2, CNC turning centre (proxy) |
| `machine-shop-2` | [Milling machines](milling-machines.md)    |     2 | station   | Milling machine (CNC or manual)                  | S2 (proxy)                |
| `machine-shop-3` | [Radial drill](radial-drill.md)            |     1 | station   | Radial arm drilling machine                      | S2 (weak proxy)           |
| `machine-shop-4` | [Inspection bench](inspection-bench.md)    |     1 | station   | Manual dimensional inspection bench              | none verified             |
| `machine-shop-5` | [Overhead crane](overhead-crane.md)        |     1 | auxiliary | Top-running overhead bridge crane, CMAA 70 Class C–D | lifts per hour only (S4) |

## Plant-level figures (Derived, not a sim run)

All machines open on the fallbacks: cycle 120 s, MTBF 4 h, MTTR 20 min, uptime 0.923.

- Three machines have one unit (Boring mill, Radial drill, Inspection bench). Each can finish 221.5 castings per shift if every casting passes it once; the first in graph order is reported as the bottleneck.
- The default scenario is then sized at demand **240** and target **200** castings per shift, at 34 °C. That is one large casting through the boring mill every 2 minutes, which is short for boring large castings (**Inference**, no verified source for boring times).
- At 30 castings per hour, the crane would need more lifts per hour than CMAA 70 Class D's 10–20 if each casting needs a lift (**Inference**; see [overhead-crane.md](overhead-crane.md)).

The only machine-tool field data found (S2) is for CNC turning centres. It is used here as a proxy for the boring mill, milling machines and radial drill, and says so in each note.
