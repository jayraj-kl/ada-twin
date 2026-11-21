import {
  type FactoryNode,
  type Kpis,
  SHIFTS_PER_YEAR,
  USD_INR,
  agentsVsRules,
  averageKpis,
  inCurrency,
  machineMoney,
  param,
  shiftMoney,
  simulate,
} from "@repo/sim";
import { describe, expect, it } from "vitest";

const HORIZON = 8 * 3600;
const RATES = {
  contributionPerPart: 1800,
  scrapCostPerPart: 650,
  technicianPerHour: 600,
  sparesPerRepair: 1200,
};

const line: FactoryNode[] = [
  { id: "intake", kind: "source", name: "Intake", interArrival: param(20, "s") },
  {
    id: "press",
    kind: "station",
    name: "Press",
    units: param(1, "units"),
    cycleTime: param(30, "s"),
    mtbf: param(1800, "s"),
    mttr: param(600, "s"),
  } as FactoryNode,
  { id: "dispatch", kind: "sink", name: "Dispatch" },
];
const edges = [
  { from: "intake", to: "press" },
  { from: "press", to: "dispatch" },
];

const kpis = (overrides: Partial<Kpis>): Kpis =>
  ({
    horizon: HORIZON,
    completed: 100,
    scrapped: 2,
    throughputPerHour: 12.5,
    averageWip: 3,
    stations: {},
    bottleneck: null,
    crew: { hours: 4, repairs: 5, services: 1, byNode: {} },
    ...overrides,
  }) as Kpis;

describe("crew work", () => {
  it("counts each repair's crew time inside the shift, by machine", async () => {
    const { kpis: run, events } = await simulate(
      { nodes: line, edges },
      { seed: 3, horizon: HORIZON },
    );
    const repairs = events.filter((event) => event.type === "repair-start").length;
    expect(repairs).toBeGreaterThan(0);
    expect(run.crew!.repairs).toBe(repairs);
    expect(run.crew!.byNode.press!.repairs).toBe(repairs);
    // Every repair's time, cut at the shift's end.
    const spent: number[] = [];
    let started: number | null = null;
    for (const event of events) {
      if (event.type === "repair-start") started = event.time;
      if (event.type === "repair-end" && started !== null) {
        spent.push(event.time - started);
        started = null;
      }
    }
    if (started !== null) spent.push(HORIZON - started);
    expect(run.crew!.hours).toBeCloseTo(
      spent.reduce((sum, seconds) => sum + seconds, 0) / 3600,
      6,
    );
  });

  it("is averaged over days, and left out when a day did not count it", () => {
    const one = kpis({ crew: { hours: 2, repairs: 2, services: 0, byNode: { press: { hours: 2, repairs: 2, services: 0 } } } });
    const two = kpis({ crew: { hours: 4, repairs: 4, services: 2, byNode: { press: { hours: 4, repairs: 4, services: 2 } } } });
    expect(averageKpis([one, two]).crew).toEqual({
      hours: 3,
      repairs: 3,
      services: 1,
      byNode: { press: { hours: 3, repairs: 3, services: 1 } },
    });
    expect(averageKpis([one, kpis({ crew: undefined })]).crew).toBeUndefined();
  });
});

describe("shift money", () => {
  it("prices lost output, scrap, crew time and spares", () => {
    expect(shiftMoney(kpis({}), 10, RATES)).toEqual({
      lostOutput: 18_000,
      scrap: 1_300,
      labour: 2_400,
      spares: 6_000,
      total: 27_700,
    });
  });

  it("cannot price a run that did not count crew work", () => {
    expect(shiftMoney(kpis({ crew: undefined }), 10, RATES)).toBeNull();
  });

  it("prices one machine's breakdowns with its own crew work", () => {
    expect(machineMoney(3, { hours: 1.5, repairs: 2, services: 0 }, RATES)).toEqual({
      lostOutput: 5_400,
      scrap: 0,
      labour: 900,
      spares: 2_400,
      total: 8_700,
    });
  });

  it("counts what the agents save and what they spend against standard rules", () => {
    const agents = kpis({
      completed: 110,
      scrapped: 1,
      crew: { hours: 5, repairs: 3, services: 4, byNode: {} },
    });
    expect(agentsVsRules(agents, kpis({}), RATES)).toEqual({
      output: 18_000,
      scrap: 650,
      // An hour more of the crews' time, on services.
      labour: -600,
      spares: 2_400,
      net: 20_450,
    });
  });

  it("shows dollars at the one stated reference rate", () => {
    expect(inCurrency(92_969.9, "USD")).toBeCloseTo(1000, 6);
    expect(inCurrency(5000, "INR")).toBe(5000);
    expect(USD_INR.date).toBe("2026-11-20");
    expect(SHIFTS_PER_YEAR).toBe(260);
  });
});
