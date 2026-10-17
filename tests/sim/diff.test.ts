import { describe, expect, it } from "vitest";
import {
  type FactoryGraph,
  applyDiffs,
  param,
  simulate,
  validateGraph,
} from "@repo/sim";

const HORIZON = 8 * 3600;

const plant = (): FactoryGraph => ({
  nodes: [
    { id: "intake", kind: "source", name: "Intake", interArrival: param(60, "s") },
    {
      id: "pumps",
      kind: "station",
      name: "Pumps",
      units: param(1, "units"),
      cycleTime: param(40, "s"),
    },
    { id: "dispatch", kind: "sink", name: "Dispatch" },
    {
      id: "cabinet",
      kind: "support",
      name: "Control cabinet",
      units: param(1, "units"),
      mtbf: param(1800, "s"),
      mttr: param(900, "s"),
    },
  ],
  edges: [
    { from: "intake", to: "pumps" },
    { from: "pumps", to: "dispatch" },
  ],
  dependencies: [{ support: "cabinet", neededBy: "pumps" }],
});

describe("applyDiffs", () => {
  it("inserts a buffer on a link, splitting it in two", () => {
    const graph = applyDiffs(plant(), [
      {
        type: "insert-buffer",
        id: "rack",
        name: "Rack",
        from: "intake",
        to: "pumps",
        capacity: 20,
      },
    ]);
    expect(validateGraph(graph)).toEqual([]);
    expect(graph.nodes.find(({ id }) => id === "rack")).toMatchObject({
      kind: "buffer",
      capacity: { value: 20 },
    });
    expect(graph.edges).toEqual([
      { from: "intake", to: "rack" },
      { from: "rack", to: "pumps" },
      { from: "pumps", to: "dispatch" },
    ]);
  });

  it("refuses a buffer on a link that does not exist", () => {
    expect(() =>
      applyDiffs(plant(), [
        {
          type: "insert-buffer",
          id: "rack",
          name: "Rack",
          from: "intake",
          to: "dispatch",
          capacity: 20,
        },
      ]),
    ).toThrow(/No link/);
  });

  it("adds standby spares to support equipment", () => {
    const graph = applyDiffs(plant(), [
      { type: "add-spare", support: "cabinet", count: 1 },
    ]);
    expect(graph.nodes.find(({ id }) => id === "cabinet")).toMatchObject({
      units: { value: 2 },
      spares: { value: 1 },
    });
    expect(validateGraph(graph)).toEqual([]);
    expect(() =>
      applyDiffs(plant(), [{ type: "add-spare", support: "pumps", count: 1 }]),
    ).toThrow(/not support/);
  });
});

describe("standby spares", () => {
  it("keep what needs the equipment running through a failure", async () => {
    const config = { seed: 7, horizon: HORIZON, maintenanceCrews: 2 };
    const without = await simulate(plant(), config);
    const spared = await simulate(
      applyDiffs(plant(), [{ type: "add-spare", support: "cabinet", count: 1 }]),
      config,
    );
    expect(without.kpis.supports?.cabinet?.down ?? 0).toBeGreaterThan(0);
    expect(spared.kpis.supports?.cabinet?.down ?? 0).toBeLessThan(
      without.kpis.supports?.cabinet?.down ?? 0,
    );
    expect(spared.kpis.completed).toBeGreaterThan(without.kpis.completed);
  });

  it("must leave at least one working unit", () => {
    const graph = plant();
    const cabinet = graph.nodes.find(({ id }) => id === "cabinet")!;
    if (cabinet.kind === "support") cabinet.spares = param(1, "units");
    expect(validateGraph(graph).join()).toMatch(/standby spares/);
  });
});
