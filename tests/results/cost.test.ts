import { type FactoryNode, type Kpis, param, traceNumbers } from "@repo/sim";
import { describe, expect, it } from "vitest";
import {
  type Losses,
  costReport,
  measureLosses,
  ratesOf,
} from "../../apps/frontend/src/results/cost";

const RATES = {
  contributionPerPart: 1800,
  scrapCostPerPart: 650,
  technicianPerHour: 600,
  sparesPerRepair: 1200,
};

const day = (overrides: Partial<Kpis>): Kpis =>
  ({
    horizon: 8 * 3600,
    completed: 200,
    scrapped: 3,
    throughputPerHour: 25,
    averageWip: 4,
    stations: {},
    bottleneck: null,
    crew: {
      hours: 6,
      repairs: 8,
      services: 0,
      byNode: {
        boilers: { hours: 4, repairs: 5, services: 0 },
        pumps: { hours: 2, repairs: 3, services: 0 },
      },
    },
    ...overrides,
  }) as Kpis;

const losses = (policy: Losses["policy"]): Losses => ({
  policy,
  days: 5,
  base: day({}),
  possible: 230,
  byMachine: [
    { id: "pumps", name: "Feed pumps", lostParts: 4 },
    { id: "boilers", name: "Boilers", lostParts: 20 },
  ],
  rules: day({
    completed: 190,
    scrapped: 4,
    crew: { hours: 5, repairs: 9, services: 0, byNode: {} },
  }),
});

describe("costReport", () => {
  it("lists where the shift lost money, biggest first", () => {
    const report = costReport(losses("rules"), RATES, { currency: "INR", unit: "batches" })!;
    expect(report.lost.map(({ label, rupees }) => [label, rupees])).toEqual([
      ["Output lost to breakdowns", 54_000],
      ["Spares", 9_600],
      ["Repair and service labour", 3_600],
      ["Scrap", 1_950],
    ]);
    expect(report.total).toBe(69_150);
  });

  it("ranks machines by what their breakdowns cost, repairs included", () => {
    const report = costReport(losses("rules"), RATES, { currency: "INR", unit: "batches" })!;
    expect(report.machines.map(({ label, rupees }) => [label, rupees])).toEqual([
      ["Boilers", 20 * 1800 + 4 * 600 + 5 * 1200],
      ["Feed pumps", 4 * 1800 + 2 * 600 + 3 * 1200],
    ]);
  });

  it("compares the agents only when their playbook ran the shift", () => {
    expect(
      costReport(losses("rules"), RATES, { currency: "INR", unit: "batches" })!.agents,
    ).toBeNull();
    const agents = costReport(losses("playbook"), RATES, {
      currency: "INR",
      unit: "batches",
    })!.agents!;
    // 10 more batches, 1 fewer scrapped, an hour more crew time, 1 repair fewer.
    expect(agents.net).toBe(18_000 + 650 - 600 + 1_200);
  });

  it("gives the brief figures it can trace, in the currency shown", () => {
    const report = costReport(losses("playbook"), RATES, {
      currency: "USD",
      unit: "batches",
    })!;
    expect(report.facts.join("\n")).toContain("$744 per shift");
    const brief =
      "The shift lost $744 per shift, most of it the $581 of output lost to breakdowns: 30 batches not made. Breakdowns at Boilers cost $477 per shift. The agents save $206 per shift.";
    const pieces = traceNumbers(brief, report.sources);
    const misses = pieces.filter((piece) => piece.number && piece.source === null);
    expect(misses).toEqual([]);
    const invented = traceNumbers("Fixing the boilers would save $9,999.", report.sources);
    expect(invented.find((piece) => piece.number)!).toMatchObject({ source: null });
  });

  it("cannot cost a run without crew work counted", () => {
    const old = { ...losses("rules"), base: day({ crew: undefined }) };
    expect(costReport(old, RATES, { currency: "INR", unit: "batches" })).toBeNull();
  });
});

describe("ratesOf", () => {
  it("needs every rate before it can cost a shift", () => {
    const doc = { kind: "user" as const };
    expect(
      ratesOf({
        contributionPerPart: { value: 1, source: doc },
        scrapCostPerPart: { value: 2, source: doc },
        technicianPerHour: { value: 3, source: doc },
      }),
    ).toBeNull();
    expect(
      ratesOf({
        contributionPerPart: { value: 1, source: doc },
        scrapCostPerPart: { value: 2, source: doc },
        technicianPerHour: { value: 3, source: doc },
        sparesPerRepair: { value: 4, source: doc },
      }),
    ).toEqual({
      contributionPerPart: 1,
      scrapCostPerPart: 2,
      technicianPerHour: 3,
      sparesPerRepair: 4,
    });
  });
});

describe("measureLosses", () => {
  it("measures what breakdowns cost, machine by machine", async () => {
    const station = (id: string, cycle: number): FactoryNode =>
      ({
        id,
        kind: "station",
        name: id,
        units: param(1, "units"),
        cycleTime: param(cycle, "s"),
        mtbf: param(3600, "s"),
        mttr: param(900, "s"),
      }) as FactoryNode;
    const measured = await measureLosses(
      {
        graph: {
          nodes: [
            { id: "intake", kind: "source", name: "Intake", interArrival: param(20, "s") },
            station("press", 30),
            station("oven", 35),
            { id: "dispatch", kind: "sink", name: "Dispatch" },
          ],
          edges: [
            { from: "intake", to: "press" },
            { from: "press", to: "oven" },
            { from: "oven", to: "dispatch" },
          ],
        },
        scenario: { name: "Test", shiftHours: 8 },
        seed: 1,
        tickMinutes: 30,
      },
      3,
    );
    expect(measured.policy).toBe("rules");
    expect(measured.possible).toBeGreaterThan(measured.base.completed);
    expect(measured.byMachine.map(({ id }) => id).sort()).toEqual(["oven", "press"]);
    expect(measured.base.crew!.repairs).toBeGreaterThan(0);
  });
});
