import type { AgentSpec } from "@repo/agent";
import { type FactoryGraph, type Scenario, param } from "@repo/sim";

/**
 * A hand-written line for the boiler hall world, used until graphs are drafted
 * from the panorama. Every number is an assumption, and is marked as one.
 */
export const DEMO_GRAPH: FactoryGraph = {
  nodes: [
    {
      id: "intake",
      kind: "source",
      name: "Batch intake",
      interArrival: param(90, "s"),
    },
    {
      id: "staging",
      kind: "buffer",
      name: "Staging rack",
      capacity: param(8, "parts"),
    },
    {
      id: "pumps",
      kind: "station",
      name: "Feed pumps",
      cycleTime: param(140, "s"),
      cycleTimeVariation: param(0.25, "share"),
      units: param(2, "units"),
      mtbf: param(3 * 3600, "s"),
      mttr: param(15 * 60, "s"),
    },
    {
      id: "header",
      kind: "buffer",
      name: "Header queue",
      capacity: param(6, "parts"),
    },
    {
      id: "boilers",
      kind: "station",
      name: "Boilers",
      cycleTime: param(160, "s"),
      cycleTimeVariation: param(0.3, "share"),
      units: param(2, "units"),
      mtbf: param(2 * 3600, "s"),
      mttr: param(25 * 60, "s"),
      scrapRate: param(0.02, "share"),
    },
    {
      id: "hold",
      kind: "buffer",
      name: "Inspection hold",
      capacity: param(4, "parts"),
    },
    {
      id: "panel",
      kind: "station",
      name: "Control panel check",
      cycleTime: param(70, "s"),
      cycleTimeVariation: param(0.2, "share"),
      units: param(1, "units"),
      mtbf: param(6 * 3600, "s"),
      mttr: param(10 * 60, "s"),
    },
    { id: "dispatch", kind: "sink", name: "Dispatch" },
  ],
  edges: [
    { from: "intake", to: "staging" },
    { from: "staging", to: "pumps" },
    { from: "pumps", to: "header" },
    { from: "header", to: "boilers" },
    { from: "boilers", to: "hold" },
    { from: "hold", to: "panel" },
    { from: "panel", to: "dispatch" },
  ],
};

export const DEMO_SCENARIO: Scenario = {
  name: "Hot week, full order book",
  shiftHours: 8,
  demandPerShift: 340,
  ambientTempC: 34,
  maintenanceCrews: 1,
  targets: { throughputPerShift: 300, maxDownShare: 0.1 },
};

export const DEMO_AGENTS: AgentSpec[] = [
  {
    id: "planner-1",
    name: "Priya",
    role: "planner",
    persona: "aggressive",
    trait: "You hate seeing the order book slip.",
  },
  {
    id: "maintenance-1",
    name: "Marek",
    role: "maintenance",
    persona: "by-the-book",
  },
  {
    id: "supervisor-1",
    name: "Sam",
    role: "supervisor",
    persona: "cautious",
    trait: "You have seen the boilers fail on hot days before.",
  },
];
