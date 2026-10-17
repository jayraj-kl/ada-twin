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

describe("new equipment", () => {
  it("inserts a new station on a link, with its numbers marked as estimates", async () => {
    const web = {
      kind: "web" as const,
      url: "https://example.com/preheater",
      confidence: "typical" as const,
    };
    const graph = applyDiffs(plant(), [
      {
        type: "insert-station",
        id: "preheater",
        name: "Feedwater pre-heater",
        from: "intake",
        to: "pumps",
        units: 1,
        cycleTime: 20,
        mtbf: 40 * 3600,
        mttr: 3600,
        provenance: web,
      },
    ]);
    expect(graph.edges).toEqual([
      { from: "intake", to: "preheater" },
      { from: "preheater", to: "pumps" },
      { from: "pumps", to: "dispatch" },
    ]);
    expect(graph.nodes.find(({ id }) => id === "preheater")).toMatchObject({
      kind: "station",
      units: { value: 1 },
      cycleTime: { value: 20, provenance: web },
    });
    expect(validateGraph(graph)).toEqual([]);
    const run = await simulate(graph, { seed: 3, horizon: HORIZON, maintenanceCrews: 1 });
    expect(run.kpis.stations.preheater).toBeDefined();
    expect(run.kpis.completed).toBeGreaterThan(0);
  });

  it("refuses a station on a link that does not exist, or a taken id", () => {
    const station = {
      type: "insert-station" as const,
      id: "preheater",
      name: "Pre-heater",
      from: "pumps",
      to: "intake",
      units: 1,
      cycleTime: 20,
    };
    expect(() => applyDiffs(plant(), [station])).toThrow(/No link/);
    expect(() =>
      applyDiffs(plant(), [{ ...station, id: "pumps", from: "intake", to: "pumps" }]),
    ).toThrow(/already/);
  });

  it("adds support equipment that what it serves cannot run without", () => {
    const graph = applyDiffs(plant(), [
      {
        type: "add-support",
        id: "softener",
        name: "Water softener",
        units: 1,
        neededBy: ["pumps"],
        mtbf: 100 * 3600,
        mttr: 1800,
      },
    ]);
    expect(graph.nodes.find(({ id }) => id === "softener")).toMatchObject({
      kind: "support",
      units: { value: 1 },
      mtbf: { value: 100 * 3600, provenance: { kind: "assumed" } },
    });
    expect(graph.dependencies).toContainEqual({ support: "softener", neededBy: "pumps" });
    expect(validateGraph(graph)).toEqual([]);
    expect(() =>
      applyDiffs(plant(), [
        { type: "add-support", id: "x", name: "X", units: 1, neededBy: ["dispatch"] },
      ]),
    ).toThrow(/cannot need/);
  });
});
