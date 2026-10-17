import { describe, expect, it } from "vitest";
import { type DecisionRecord, writePlaybook } from "@repo/agent";
import { type FactoryGraph, param } from "@repo/sim";
import { scripted } from "./support";

const graph: FactoryGraph = {
  nodes: [
    {
      id: "intake",
      kind: "source",
      name: "Intake",
      interArrival: param(60, "s"),
    },
    {
      id: "boilers",
      kind: "station",
      name: "Boilers",
      units: param(2, "units"),
      cycleTime: param(50, "s"),
    },
    {
      id: "cabinet",
      kind: "support",
      name: "Cabinet",
      units: param(1, "units"),
    },
    { id: "dispatch", kind: "sink", name: "Dispatch" },
  ],
  edges: [
    { from: "intake", to: "boilers" },
    { from: "boilers", to: "dispatch" },
  ],
};

const decisions: DecisionRecord[] = [
  {
    agent: { id: "a", name: "Priya", role: "maintenance", persona: "cautious" },
    kind: "assign-crew",
    time: 3600,
    options: ["Repair Boilers unit 1", "Repair Cabinet"],
    choice: 1,
    reason: "The cabinet stops everything.",
  },
];

describe("writePlaybook", () => {
  it("sends the decision log with the machines' ids", async () => {
    const { ask, requests } = scripted(() => ({}));
    await writePlaybook(ask, { graph, goal: "Ship 300 parts.", decisions });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.search).toBeFalsy();
    expect(requests[0]!.prompt).toContain("- cabinet: Cabinet (support equipment)");
    expect(requests[0]!.prompt).toContain('chose "Repair Cabinet"');
  });

  it("keeps the rules that fit the plant and drops the rest", async () => {
    const { ask } = scripted(() => ({
      repairOrder: ["cabinet", "ghost", "boilers", "cabinet"],
      release: [
        { source: "intake", slowAboveWip: 14, fastBelowWip: 5 },
        { source: "boilers", slowAboveWip: 10, fastBelowWip: 2 },
      ],
      service: [
        { machine: "boilers", everyHours: 3 },
        { machine: "cabinet", everyHours: 0 },
      ],
      notes: "  They fixed the cabinet first.  ",
    }));
    expect(
      await writePlaybook(ask, { graph, goal: "Ship 300 parts.", decisions }),
    ).toEqual({
      repairOrder: ["cabinet", "boilers"],
      release: { intake: { slowAboveWip: 14, fastBelowWip: 5 } },
      serviceEveryHours: { boilers: 3 },
      notes: "They fixed the cabinet first.",
    });
  });

  it("drops a release rule whose thresholds cross", async () => {
    const { ask } = scripted(() => ({
      release: [{ source: "intake", slowAboveWip: 4, fastBelowWip: 9 }],
    }));
    const playbook = await writePlaybook(ask, {
      graph,
      goal: "Ship 300 parts.",
      decisions,
    });
    expect(playbook.release).toEqual({});
    expect(playbook.repairOrder).toEqual([]);
  });

  it("keeps a pace the crew only ever sped up", async () => {
    const { ask } = scripted(() => ({
      release: [{ source: "intake", slowAboveWip: null, fastBelowWip: 3 }],
    }));
    const playbook = await writePlaybook(ask, {
      graph,
      goal: "Ship 300 parts.",
      decisions,
    });
    expect(playbook.release).toEqual({ intake: { fastBelowWip: 3 } });
  });
});
