import { describe, expect, it } from "vitest";
import {
  type FactoryGraph,
  averageKpis,
  param,
  simulate,
  simulateDays,
  spread,
} from "@repo/sim";

const HORIZON = 8 * 3600;

const graph: FactoryGraph = {
  nodes: [
    {
      id: "intake",
      kind: "source",
      name: "Intake",
      interArrival: param(60, "s"),
    },
    {
      id: "press",
      kind: "station",
      name: "Press",
      units: param(1, "units"),
      cycleTime: param(50, "s"),
      cycleTimeVariation: param(0.3, "share"),
      mtbf: param(3600, "s"),
      mttr: param(900, "s"),
    },
    { id: "dispatch", kind: "sink", name: "Dispatch" },
  ],
  edges: [
    { from: "intake", to: "press" },
    { from: "press", to: "dispatch" },
  ],
};

const config = { seed: 7, horizon: HORIZON, maintenanceCrews: 1 };

describe("simulateDays", () => {
  it("replays the run's own seed on day one, then moves on to the next", async () => {
    const days = await simulateDays(graph, config, 3);
    const first = await simulate(graph, { ...config, recordEvents: false });
    const third = await simulate(graph, {
      ...config,
      seed: config.seed + 2,
      recordEvents: false,
    });
    expect(days).toHaveLength(3);
    expect(days[0]).toEqual(first.kpis);
    expect(days[2]).toEqual(third.kpis);
  });

  it("gives different days different random events", async () => {
    const days = await simulateDays(graph, config, 5);
    const shipped = new Set(days.map(({ completed }) => completed));
    expect(shipped.size).toBeGreaterThan(1);
  });
});

describe("spread", () => {
  it("is the mean with the lowest and highest values", () => {
    expect(spread([4, 10, 7])).toEqual({ mean: 7, min: 4, max: 10 });
  });

  it("refuses to average nothing", () => {
    expect(() => spread([])).toThrow();
  });
});

describe("averageKpis", () => {
  it("averages every measure over the days", async () => {
    const days = await simulateDays(graph, config, 4);
    const average = averageKpis(days);
    const mean = (values: number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(average.completed).toBeCloseTo(
      mean(days.map(({ completed }) => completed)),
    );
    expect(average.stations.press!.down).toBeCloseTo(
      mean(days.map(({ stations }) => stations.press!.down)),
    );
    expect(average.bottleneck).toBe("press");
  });

  it("is the day itself when there is only one", async () => {
    const [day] = await simulateDays(graph, config, 1);
    expect(averageKpis([day!])).toEqual({ ...day, supports: {} });
  });
});
