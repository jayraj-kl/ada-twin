import { describe, expect, it } from "vitest";
import {
  type DecisionRequest,
  EMPTY_PLAYBOOK,
  type FactoryGraph,
  type Snapshot,
  param,
  playbookPolicy,
  simulate,
} from "@repo/sim";

const snapshot = (overrides: Partial<Snapshot> = {}): Snapshot => ({
  time: 3600,
  completed: 0,
  scrapped: 0,
  wip: 10,
  freeCrews: 1,
  stations: [
    {
      id: "press",
      name: "Press",
      status: "running",
      busyUnits: 1,
      unitsDown: 0,
      units: 1,
      wearHours: 5,
    },
    {
      id: "oven",
      name: "Oven",
      status: "running",
      busyUnits: 1,
      unitsDown: 0,
      units: 1,
      wearHours: 1,
    },
  ],
  buffers: [],
  sources: [
    {
      id: "intake",
      name: "Intake",
      blocked: false,
      stopped: false,
      releaseFactor: 1,
    },
  ],
  supports: [],
  ...overrides,
});

describe("playbookPolicy", () => {
  it("is the standard rules when the playbook is empty", async () => {
    const graph: FactoryGraph = {
      nodes: [
        {
          id: "intake",
          kind: "source",
          name: "Intake",
          interArrival: param(40, "s"),
        },
        {
          id: "press",
          kind: "station",
          name: "Press",
          units: param(2, "units"),
          cycleTime: param(60, "s"),
          mtbf: param(1800, "s"),
          mttr: param(900, "s"),
        },
        { id: "dispatch", kind: "sink", name: "Dispatch" },
      ],
      edges: [
        { from: "intake", to: "press" },
        { from: "press", to: "dispatch" },
      ],
    };
    const config = { seed: 3, horizon: 8 * 3600, tickInterval: 1800 };
    const standard = await simulate(graph, config);
    const empty = await simulate(graph, config, playbookPolicy(EMPTY_PLAYBOOK));
    expect(empty.kpis).toEqual(standard.kpis);
  });

  it("repairs in the listed order, then by who waited longest", () => {
    const policy = playbookPolicy({
      ...EMPTY_PLAYBOOK,
      repairOrder: ["oven"],
    });
    const request: DecisionRequest = {
      kind: "assign-crew",
      role: "maintenance",
      snapshot: snapshot(),
      options: [
        { station: "press", job: "repair", waitingSince: 100 },
        { station: "dispatch", job: "repair", waitingSince: 50 },
        { station: "oven", job: "repair", waitingSince: 200 },
      ],
    };
    expect(policy.decide(request)).toEqual({ choice: 2 });
    const unlisted = playbookPolicy(EMPTY_PLAYBOOK);
    expect(unlisted.decide(request)).toEqual({ choice: 1 });
  });

  it("paces release by work in progress", () => {
    const policy = playbookPolicy({
      ...EMPTY_PLAYBOOK,
      release: { intake: { slowAboveWip: 12, fastBelowWip: 4 } },
    });
    const ask = (wip: number, releaseFactor = 1) =>
      policy.decide({
        kind: "plan-release",
        role: "planner",
        snapshot: snapshot({
          wip,
          sources: [
            {
              id: "intake",
              name: "Intake",
              blocked: false,
              stopped: false,
              releaseFactor,
            },
          ],
        }),
        options: [
          { type: "none" },
          ...[0.8, 1, 1.2]
            .filter((factor) => factor !== releaseFactor)
            .map((factor) => ({
              type: "set-release" as const,
              source: "intake",
              factor,
            })),
        ],
      });
    expect(ask(20)).toEqual({ choice: 1 }); // x0.8
    expect(ask(2)).toEqual({ choice: 2 }); // x1.2
    expect(ask(8)).toEqual({ choice: 0 }); // already nominal
    expect(ask(8, 0.8)).toEqual({ choice: 1 }); // back to x1
  });

  it("never slows a source whose crew only sped it up", () => {
    const policy = playbookPolicy({
      ...EMPTY_PLAYBOOK,
      release: { intake: { fastBelowWip: 4 } },
    });
    const decide = (wip: number) =>
      policy.decide({
        kind: "plan-release",
        role: "planner",
        snapshot: snapshot({ wip }),
        options: [
          { type: "none" },
          { type: "set-release", source: "intake", factor: 0.8 },
          { type: "set-release", source: "intake", factor: 1.2 },
        ],
      });
    expect(decide(50)).toEqual({ choice: 0 });
    expect(decide(2)).toEqual({ choice: 2 });
  });

  it("services the machine furthest past its interval, if a crew is free", () => {
    const policy = playbookPolicy({
      ...EMPTY_PLAYBOOK,
      serviceEveryHours: { press: 4, oven: 0.5 },
    });
    const request = (freeCrews: number): DecisionRequest => ({
      kind: "shift-tick",
      role: "supervisor",
      snapshot: snapshot({ freeCrews }),
      options: [
        { type: "none" },
        { type: "preventive", station: "press" },
        { type: "preventive", station: "oven" },
      ],
    });
    // Press is 1.25x its interval, the oven 2x.
    expect(policy.decide(request(1))).toEqual({ choice: 2 });
    expect(policy.decide(request(0))).toEqual({ choice: 0 });
  });
});
