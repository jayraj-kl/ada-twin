import { describe, expect, it } from "vitest";
import { type FactoryGraph, param, shiftCapacity } from "@repo/sim";

const line = (stations: { id: string; units: number; cycle: number; mtbf?: number; mttr?: number }[]): FactoryGraph => ({
  nodes: [
    { id: "in", kind: "source", name: "In", interArrival: param(10, "s") },
    ...stations.map(({ id, units, cycle, mtbf, mttr }) => ({
      id,
      kind: "station" as const,
      name: id,
      units: param(units, "units"),
      cycleTime: param(cycle, "s"),
      ...(mtbf ? { mtbf: param(mtbf, "s") } : {}),
      ...(mttr ? { mttr: param(mttr, "s") } : {}),
    })),
    { id: "out", kind: "sink", name: "Out" },
  ],
  edges: ["in", ...stations.map(({ id }) => id), "out"]
    .slice(0, -1)
    .map((from, index, ids) => ({ from, to: ids[index + 1] ?? "out" })),
});

describe("shiftCapacity", () => {
  it("is set by the slowest station on a line", () => {
    const capacity = shiftCapacity(
      line([
        { id: "saw", units: 1, cycle: 60 },
        { id: "lathe", units: 2, cycle: 300 },
      ]),
      8,
    )!;
    // 2 lathes × 28 800 s / 300 s = 192; the saw manages 480.
    expect(capacity.bottleneck).toBe("lathe");
    expect(capacity.perShift).toBeCloseTo(192);
    // 192 per 28 800 s through 360 s of cycles: about 2.4 in the plant.
    expect(capacity.minimumWip).toBeCloseTo(2.4);
  });

  it("counts uptime", () => {
    const capacity = shiftCapacity(
      line([{ id: "boiler", units: 1, cycle: 100, mtbf: 3 * 3600, mttr: 3600 }]),
      8,
    )!;
    expect(capacity.perShift).toBeCloseTo(288 * 0.75);
  });

  it("splits work at forks as the kernel routes it", () => {
    const graph: FactoryGraph = {
      nodes: [
        { id: "in", kind: "source", name: "In", interArrival: param(10, "s") },
        { id: "a", kind: "station", name: "A", units: param(1, "units"), cycleTime: param(100, "s") },
        { id: "b", kind: "station", name: "B", units: param(1, "units"), cycleTime: param(100, "s") },
        { id: "out", kind: "sink", name: "Out" },
      ],
      edges: [
        { from: "in", to: "a", share: 3 },
        { from: "in", to: "b", share: 1 },
        { from: "a", to: "out" },
        { from: "b", to: "out" },
      ],
    };
    const capacity = shiftCapacity(graph, 8)!;
    // A takes three quarters of the work: 288 / 0.75 = 384.
    expect(capacity.bottleneck).toBe("a");
    expect(capacity.perShift).toBeCloseTo(384);
  });

  it("has nothing to say when no work reaches a station", () => {
    const graph = line([{ id: "saw", units: 1, cycle: 60 }]);
    expect(shiftCapacity({ ...graph, edges: [] }, 8)).toBeUndefined();
  });
});
