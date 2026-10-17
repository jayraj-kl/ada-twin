import { describe, expect, it } from "vitest";
import {
  type DecisionRequest,
  type FactoryGraph,
  type FactoryNode,
  type SimEvent,
  param,
  simulate,
  validateGraph,
} from "@repo/sim";

const HORIZON = 8 * 3600;

const intake: FactoryNode = {
  id: "intake",
  kind: "source",
  name: "Intake",
  interArrival: param(60, "s"),
};
const boilers: FactoryNode = {
  id: "boilers",
  kind: "station",
  name: "Boilers",
  units: param(1, "units"),
  cycleTime: param(30, "s"),
};
const dispatch: FactoryNode = {
  id: "dispatch",
  kind: "sink",
  name: "Dispatch",
};
const cabinet = (units = 1): FactoryNode => ({
  id: "cabinet",
  kind: "support",
  name: "Control cabinet",
  units: param(units, "units"),
  mtbf: param(1800, "s"),
  mttr: param(600, "s"),
});
const line: FactoryGraph["edges"] = [
  { from: "intake", to: "boilers" },
  { from: "boilers", to: "dispatch" },
];

/** The stretches during which the cabinet had a unit that was not up. */
function downIntervals(events: SimEvent[]): [number, number][] {
  const intervals: [number, number][] = [];
  const out = new Set<number>();
  let since = 0;
  for (const event of events) {
    if (!("node" in event) || event.node !== "cabinet") continue;
    const unit = "unit" in event ? (event.unit ?? 0) : 0;
    if (event.type === "failure" || event.type === "preventive-start") {
      if (out.size === 0) since = event.time;
      out.add(unit);
    } else if (event.type === "repair-end" || event.type === "preventive-end") {
      out.delete(unit);
      if (out.size === 0) intervals.push([since, event.time]);
    }
  }
  if (out.size > 0) intervals.push([since, HORIZON]);
  return intervals;
}

describe("support equipment", () => {
  it("stops what needs it while it is down, without counting it as a failure", async () => {
    const { kpis, events } = await simulate(
      {
        nodes: [intake, boilers, dispatch, cabinet()],
        edges: line,
        dependencies: [{ support: "cabinet", neededBy: "boilers" }],
      },
      { seed: 3, horizon: HORIZON },
    );

    const boiler = kpis.stations.boilers!;
    expect(
      events.some((e) => e.type === "failure" && e.node === "cabinet"),
    ).toBe(true);
    expect(boiler.down).toBe(0);
    expect(boiler.stopped).toBeGreaterThan(0);
    expect(boiler.stopped).toBeCloseTo(kpis.supports!.cabinet!.down, 6);
    expect(boiler.stoppedBy.cabinet).toBeCloseTo(boiler.stopped, 6);
    // Nothing starts on the boilers while the cabinet is out.
    const intervals = downIntervals(events);
    const starts = events.filter(
      (e) => e.type === "start" && e.node === "boilers",
    );
    for (const start of starts) {
      expect(
        intervals.some(([from, to]) => start.time > from && start.time < to),
      ).toBe(false);
    }
  });

  it("never wears out when nothing needs it", async () => {
    const { kpis, events } = await simulate(
      { nodes: [intake, boilers, dispatch, cabinet()], edges: line },
      { seed: 3, horizon: HORIZON },
    );
    expect(kpis.stations.boilers!.stopped).toBe(0);
    expect(events.some((e) => e.type === "failure")).toBe(false);
  });

  it("fails unit by unit, and a single unit out stops what needs it", async () => {
    const { kpis, events } = await simulate(
      {
        nodes: [intake, boilers, dispatch, cabinet(3)],
        edges: line,
        dependencies: [{ support: "cabinet", neededBy: "boilers" }],
      },
      { seed: 5, horizon: HORIZON, maintenanceCrews: 3 },
    );
    const failedUnits = new Set(
      events.flatMap((e) =>
        e.type === "failure" && e.node === "cabinet" ? [e.unit] : [],
      ),
    );
    expect(failedUnits.size).toBeGreaterThan(1);
    expect(kpis.stations.boilers!.stopped).toBeCloseTo(
      kpis.supports!.cabinet!.down,
      6,
    );
  });

  it("holds back a source that needs it", async () => {
    const { events } = await simulate(
      {
        nodes: [intake, boilers, dispatch, cabinet()],
        edges: line,
        dependencies: [{ support: "cabinet", neededBy: "intake" }],
      },
      { seed: 7, horizon: HORIZON },
    );
    const intervals = downIntervals(events);
    expect(intervals.length).toBeGreaterThan(0);
    const created = events.filter((e) => e.type === "created");
    for (const part of created) {
      expect(
        intervals.some(([from, to]) => part.time > from && part.time < to),
      ).toBe(false);
    }
  });

  it("puts its repairs in the same crew queue as the stations", async () => {
    const offered: DecisionRequest[] = [];
    const { events } = await simulate(
      {
        nodes: [
          intake,
          {
            ...boilers,
            units: param(2, "units"),
            mtbf: param(1200, "s"),
            mttr: param(2400, "s"),
          },
          dispatch,
          cabinet(),
        ],
        edges: line,
        dependencies: [{ support: "cabinet", neededBy: "boilers" }],
      },
      { seed: 1, horizon: HORIZON, tickInterval: 1800 },
      {
        decide: (request) => {
          offered.push(request);
          return { choice: 0 };
        },
      },
    );
    // With one crew, a cabinet that fails while one boiler is under repair
    // (the other kept it working) waits for that repair to finish.
    const boilersFixed = new Set(
      events.flatMap((e) =>
        e.type === "repair-end" && e.node === "boilers" ? [e.time] : [],
      ),
    );
    expect(
      events.some(
        (e) =>
          e.type === "repair-start" &&
          e.node === "cabinet" &&
          boilersFixed.has(e.time),
      ),
    ).toBe(true);
    const services = offered.flatMap((request) =>
      request.kind === "shift-tick" ? request.options : [],
    );
    expect(
      services.some(
        (action) =>
          action.type === "preventive" && action.station === "cabinet",
      ),
    ).toBe(true);
    const snapshot = offered[0]!.snapshot;
    expect(snapshot.supports).toEqual([
      expect.objectContaining({ id: "cabinet", neededBy: ["Boilers"] }),
    ]);
  });

  it("rejects support equipment on the parts path, or needed by a buffer", () => {
    const rack: FactoryNode = {
      id: "rack",
      kind: "buffer",
      name: "Rack",
      capacity: param(4, "parts"),
    };
    expect(
      validateGraph({
        nodes: [intake, rack, boilers, dispatch, cabinet()],
        edges: [
          { from: "intake", to: "rack" },
          { from: "rack", to: "boilers" },
          { from: "boilers", to: "cabinet" },
          { from: "boilers", to: "dispatch" },
        ],
        dependencies: [
          { support: "cabinet", neededBy: "rack" },
          { support: "boilers", neededBy: "intake" },
        ],
      }),
    ).toEqual([
      '"cabinet" can only be needed by a station or source, not "rack"',
      '"boilers" is needed by "intake" but is not support equipment',
      '"cabinet" is support equipment and handles no parts',
    ]);
  });
});
