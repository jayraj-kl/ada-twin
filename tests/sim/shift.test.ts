import { describe, expect, it } from "vitest";
import {
  type FactoryGraph,
  type Scenario,
  applyScenario,
  param,
  prepareShift,
  simulateDays,
  simulateShiftDays,
} from "@repo/sim";

const plant = (): FactoryGraph => ({
  nodes: [
    { id: "intake", kind: "source", name: "Intake", interArrival: param(60, "s") },
    {
      id: "press",
      kind: "station",
      name: "Press",
      units: param(1, "units"),
      cycleTime: param(50, "s"),
      mtbf: param(3600, "s"),
      mttr: param(900, "s"),
    },
    { id: "dispatch", kind: "sink", name: "Dispatch" },
  ],
  edges: [
    { from: "intake", to: "press" },
    { from: "press", to: "dispatch" },
  ],
});

const hot: Scenario = { name: "Heatwave", shiftHours: 8, ambientTempC: 35 };

describe("prepareShift", () => {
  it("is the scenario applied to the twin when nothing changes", () => {
    const applied = applyScenario(plant(), hot);
    const shift = prepareShift({ graph: plant(), scenario: hot, seed: 3, tickMinutes: 30 });
    expect(shift.graph).toEqual(applied.graph);
    expect(shift.adjustments).toEqual(applied.adjustments);
    expect(shift.config).toEqual({
      seed: 3,
      horizon: 8 * 3600,
      maintenanceCrews: 1,
      tickInterval: 30 * 60,
    });
  });

  it("makes the changes before the scenario, so a new machine feels the heat", () => {
    const { graph } = prepareShift({
      graph: plant(),
      scenario: hot,
      seed: 1,
      tickMinutes: 30,
      changes: [
        {
          diffs: [
            {
              type: "insert-station",
              id: "polish",
              name: "Polish",
              from: "press",
              to: "dispatch",
              units: 1,
              cycleTime: 40,
            },
          ],
        },
      ],
    });
    const polish = graph.nodes.find(({ id }) => id === "polish");
    expect(polish?.kind).toBe("station");
    // 10°C above the reference slows every station by 5%, the new one too.
    expect(polish?.kind === "station" && polish.cycleTime.value).toBeCloseTo(42);
  });

  it("makes extra crews as short-handed as the scenario's own", () => {
    const shift = prepareShift({
      graph: plant(),
      scenario: { ...hot, maintenanceCrews: 2, absenteeism: 0.5 },
      seed: 1,
      tickMinutes: 30,
      changes: [{ diffs: [], extraCrews: 2 }],
    });
    // Four crews on paper, half of them off.
    expect(shift.config.maintenanceCrews).toBe(2);
  });

  it("never changes the twin it was given", () => {
    const twin = plant();
    prepareShift({
      graph: twin,
      scenario: hot,
      seed: 1,
      tickMinutes: 30,
      changes: [{ diffs: [{ type: "add-units", station: "press", count: 1 }] }],
    });
    expect(twin).toEqual(plant());
  });
});

describe("simulateShiftDays", () => {
  it("replays the same days as simulating the prepared plant", async () => {
    const shift = { graph: plant(), scenario: hot, seed: 5, tickMinutes: 30 };
    const { graph, config } = prepareShift(shift);
    expect(await simulateShiftDays(shift, 3)).toEqual(
      await simulateDays(graph, config, 3),
    );
  });

  it("pairs days by seed, so a change's gain is measured on the same days", async () => {
    const base = { graph: plant(), scenario: hot, seed: 11, tickMinutes: 30 };
    const before = await simulateShiftDays(base, 4);
    const after = await simulateShiftDays(
      { ...base, changes: [{ diffs: [{ type: "add-units", station: "press", count: 1 }] }] },
      4,
    );
    expect(after).toHaveLength(4);
    const gained = after.reduce((sum, day, index) => sum + day.completed - before[index]!.completed, 0);
    expect(gained).toBeGreaterThan(0);
  });
});
