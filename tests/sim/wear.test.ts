import { describe, expect, it } from "vitest";
import {
  type FactoryGraph,
  type FactoryNode,
  type Snapshot,
  param,
  simulate,
} from "@repo/sim";

const HORIZON = 8 * 3600;

const source = (seconds: number): FactoryNode => ({
  id: "intake",
  kind: "source",
  name: "Intake",
  interArrival: param(seconds, "s"),
});
const press = (overrides: Partial<FactoryNode> = {}): FactoryNode =>
  ({
    id: "press",
    kind: "station",
    name: "Press",
    units: param(1, "units"),
    cycleTime: param(30, "s"),
    mtbf: param(1800, "s"),
    mttr: param(600, "s"),
    ...overrides,
  }) as FactoryNode;
const dispatch: FactoryNode = { id: "dispatch", kind: "sink", name: "Dispatch" };
const line = (...ids: string[]) =>
  ids.slice(1).map((to, index) => ({ from: ids[index]!, to }));

describe("wear", () => {
  it("builds only while a machine works, so one that gets no parts never fails", async () => {
    const { events, kpis } = await simulate(
      {
        nodes: [source(10 * HORIZON), press(), dispatch],
        edges: line("intake", "press", "dispatch"),
      },
      { seed: 1, horizon: HORIZON },
    );
    expect(kpis.stations.press!.utilisation).toBeLessThan(0.01);
    expect(events.some((e) => e.type === "failure")).toBe(false);
  });

  it("does not count time blocked, holding a part with nowhere to go", async () => {
    // The press is fast and the oven behind it slow, so the press spends most
    // of the shift holding a finished part.
    const oven: FactoryNode = {
      id: "oven",
      kind: "station",
      name: "Oven",
      units: param(1, "units"),
      cycleTime: param(300, "s"),
    };
    const snapshots: Snapshot[] = [];
    const tick = HORIZON / 2;
    const { kpis } = await simulate(
      {
        nodes: [
          source(20),
          press({ mtbf: param(1e9, "s") } as Partial<FactoryNode>),
          oven,
          dispatch,
        ],
        edges: line("intake", "press", "oven", "dispatch"),
      },
      // One check-in, a second before the end, to read the press's wear.
      { seed: 2, horizon: tick + 1, tickInterval: tick },
      {
        decide: (request) => {
          snapshots.push(request.snapshot);
          return { choice: 0 };
        },
      },
    );
    const measured = kpis.stations.press!;
    expect(measured.blocked).toBeGreaterThan(0.5);
    const worked = snapshots[0]!.stations.find(({ id }) => id === "press")!;
    // Worn hours match the time it spent processing, not processing + blocked.
    expect(worked.wearHours * 3600).toBeCloseTo(
      measured.utilisation * (tick + 1),
      -1,
    );
  });

  it("breaks one unit at a time; the others keep working", async () => {
    const { events, kpis } = await simulate(
      {
        nodes: [
          source(10),
          press({ units: param(2, "units") } as Partial<FactoryNode>),
          dispatch,
        ],
        edges: line("intake", "press", "dispatch"),
      },
      { seed: 4, horizon: HORIZON },
    );
    const failure = events.find((e) => e.type === "failure");
    expect(failure).toBeDefined();
    const unit = "unit" in failure! ? failure.unit : undefined;
    const fixed = events.find(
      (e) =>
        e.type === "repair-end" &&
        "unit" in e &&
        e.unit === unit &&
        e.time > failure!.time,
    );
    const finishedMeanwhile = events.some(
      (e) =>
        e.type === "finish" &&
        e.node === "press" &&
        e.time > failure!.time &&
        e.time < (fixed?.time ?? HORIZON),
    );
    expect(finishedMeanwhile).toBe(true);
    // A unit out counts against half the station's capacity, not all of it.
    expect(kpis.stations.press!.down).toBeLessThan(0.5);
  });

  it("wears auxiliary equipment only while what needs it works", async () => {
    const graph: FactoryGraph = {
      nodes: [
        source(10 * HORIZON),
        press({ mtbf: undefined } as Partial<FactoryNode>),
        dispatch,
        {
          id: "cabinet",
          kind: "support",
          name: "Cabinet",
          units: param(1, "units"),
          mtbf: param(600, "s"),
          mttr: param(600, "s"),
        },
      ],
      edges: line("intake", "press", "dispatch"),
      dependencies: [{ support: "cabinet", neededBy: "press" }],
    };
    const { events } = await simulate(graph, { seed: 3, horizon: HORIZON });
    expect(events.some((e) => e.type === "failure")).toBe(false);
  });

  it("does not wear a standby spare until it takes over", async () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { events } = await simulate(
        {
          nodes: [
            source(10),
            press({ mtbf: undefined } as Partial<FactoryNode>),
            dispatch,
            {
              id: "cabinet",
              kind: "support",
              name: "Cabinet",
              units: param(2, "units"),
              spares: param(1, "units"),
              mtbf: param(1800, "s"),
              mttr: param(600, "s"),
            },
          ],
          edges: line("intake", "press", "dispatch"),
          dependencies: [{ support: "cabinet", neededBy: "press" }],
        },
        { seed, horizon: HORIZON },
      );
      const failures = events.flatMap((e) =>
        e.type === "failure" && "unit" in e ? [e.unit] : [],
      );
      expect(failures.length).toBeGreaterThan(0);
      // Unit 1 stands by, so unit 0 always wears out first.
      expect(failures[0]).toBe(0);
    }
  });

  it("still replays exactly from the same seed", async () => {
    const graph: FactoryGraph = {
      nodes: [
        source(25),
        press({ units: param(2, "units") } as Partial<FactoryNode>),
        dispatch,
      ],
      edges: line("intake", "press", "dispatch"),
    };
    const config = { seed: 9, horizon: HORIZON, tickInterval: 1800 };
    const first = await simulate(graph, config);
    const second = await simulate(graph, config);
    expect(second.events).toEqual(first.events);
    expect(second.kpis).toEqual(first.kpis);
  });
});
