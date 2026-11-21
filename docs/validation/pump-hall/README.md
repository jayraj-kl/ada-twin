# Pump hall: validation notes

Sample slug `pump-hall`. Unit of work: **batches** (of water). Sources and method: [../README.md](../README.md). Read on 2026-11-20.

## Process flow

As given in `apps/frontend/src/twin/sample.ts`:

> Batches of water come in from the intake well and wait in the suction tank. The main pumps lift them to the header, where a booster pump raises the pressure. They are checked at the control panel and leave through the outlet main.

```
intake well → suction tank → Main pumps ×2 → header → Booster pump ×1 → Control panel ×1 → outlet main
```

This sample has no auxiliary machine. Links and buffers are drafted at runtime by the flow-drafter agent and corrected by the user; the sketch is the likely draft (**Inference**).

## What it counts

The plant counts **batches** of water, with no defined volume. A pump's published duty is a flow rate at a head, so "seconds per batch" can only be compared once a batch volume is fixed (cycle time = batch volume / rated flow).

A pumping station moves water continuously; the sim moves it in discrete batches through a queue. That is a modelling simplification, not a figure to validate.

## Machines

| Id            | Machine                              | Count | Role    | Equipment class                                 | Baseline found       |
| ------------- | ------------------------------------ | ----: | ------- | ----------------------------------------------- | -------------------- |
| `pump-hall-1` | [Main pumps](main-pumps.md)          |     2 | station | Water-service centrifugal pump, motor driven    | S1 Pump              |
| `pump-hall-2` | [Booster pump](booster-pump.md)      |     1 | station | Booster centrifugal pump                        | S1 Pump              |
| `pump-hall-3` | [Control panel](control-panel.md)    |     1 | station | Pumping-station control panel                   | S1 Control Panel, Control System |

S1's surveyed facilities include "water treatment facilities", which makes it a closer match here than for the other samples.

## Plant-level figures (Derived, not a sim run)

All machines open on the fallbacks: cycle 120 s, MTBF 4 h, MTTR 20 min, uptime 0.923.

- The Booster pump and the Control panel each have one unit and can finish 221.5 batches per shift if every batch passes them once. The default scenario is sized at demand **240** and target **200** batches per shift, at 34 °C.
- The sim's two Main pumps work as two parallel units. A real pump hall often runs one duty pump with one on standby (**Inference**). The sim has no standby for stations, only for auxiliary machines (`spares`). Two units in parallel overstate capacity and understate the cost of one pump failing, compared with duty/standby.
