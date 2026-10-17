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
    {
      id: "pumps",
      name: "Feed pumps",
      status: "running",
      busyUnits: 1,
      unitsDown: 1,
      units: 2,
      wearHours: 3,
    },
  ],
  buffers: [],
  sources: [
    {
      id: "intake",
      name: "Batch intake",
      blocked: false,
      stopped: false,
      releaseFactor: 1,
    },
  ],
  supports: [
    {
      id: "cabinets",
      name: "Control cabinets",
      status: "down",
      unitsDown: 1,
      units: 4,
      neededBy: ["Boilers"],
      wearHours: 2,
    },
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
      options: [
        { station: "pumps", unit: 1, job: "repair", waitingSince: 600 },
        { station: "cabinets", unit: 2, job: "repair", waitingSince: 1200 },
      ],
    });
    expect(options).toEqual([
      "Repair Feed pumps unit 2 (waiting 20 min)",
      "Repair Control cabinets unit 3 (waiting 10 min; Boilers stopped until it is fixed)",
    ]);
  });

  it("words the supervisor's options as servicing", () => {
    const options = ROLES.supervisor.describeOptions({
      kind: "shift-tick",
      role: "supervisor",
      snapshot,
      options: [
        { type: "none" },
        { type: "preventive", station: "pumps" },
        { type: "preventive", station: "cabinets" },
      ],
    });
    expect(options).toEqual([
      "Change nothing",
      "Take the most worn unit of Feed pumps out for preventive servicing",
      "Take one unit of Control cabinets out for preventive servicing (stops Boilers meanwhile)",
    ]);
  });
});
