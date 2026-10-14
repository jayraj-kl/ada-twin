import type { Snapshot } from "@repo/sim";
import { describe, expect, it } from "vitest";
import { ROLES } from "@repo/agent";

const snapshot: Snapshot = {
  time: 1800,
  completed: 0,
  scrapped: 0,
  wip: 0,
  freeCrews: 1,
  stations: [
    { id: "pumps", name: "Feed pumps", status: "down", busyUnits: 0, units: 2 },
  ],
  buffers: [],
  sources: [
    { id: "intake", name: "Batch intake", blocked: false, releaseFactor: 1 },
  ],
};

describe("ROLES", () => {
  it("words the planner's options as release rates", () => {
    const options = ROLES.planner.describeOptions({
      kind: "plan-release",
      role: "planner",
      snapshot,
      options: [
        { type: "none" },
        { type: "set-release", source: "intake", factor: 1.2 },
      ],
    });
    expect(options).toEqual([
      "Change nothing",
      "Release Batch intake at 120% of the nominal rate",
    ]);
  });

  it("words the technician's options as waiting jobs", () => {
    const options = ROLES.maintenance.describeOptions({
      kind: "assign-crew",
      role: "maintenance",
      snapshot,
      options: [{ station: "pumps", job: "repair", waitingSince: 600 }],
    });
    expect(options).toEqual(["Repair Feed pumps (waiting 20 min)"]);
  });

  it("words the supervisor's options as servicing", () => {
    const options = ROLES.supervisor.describeOptions({
      kind: "shift-tick",
      role: "supervisor",
      snapshot,
      options: [{ type: "none" }, { type: "preventive", station: "pumps" }],
    });
    expect(options).toEqual([
      "Change nothing",
      "Take Feed pumps out for preventive servicing",
    ]);
  });
});
