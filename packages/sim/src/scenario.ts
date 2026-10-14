import type { FactoryGraph, Param } from "./graph";

// Conditions are measured against this ambient temperature.
const REFERENCE_TEMP_C = 25;
// Assumed effects per °C above the reference. These are modelling
// assumptions, shown to the user, not measurements of their plant.
const MTBF_LOSS_PER_DEGREE = 0.02;
const CYCLE_GAIN_PER_DEGREE = 0.005;
// Heat never cuts time-between-failures below this share of nominal.
const MTBF_FLOOR = 0.4;

/** The external conditions and targets a factory is simulated against. */
export interface Scenario {
  name: string;
  shiftHours: number;
  /** Parts released per shift across all sources; omit to keep the graph's rate. */
  demandPerShift?: number;
  ambientTempC?: number;
  /** Share of incoming supply lost, 0..1. */
  supplyDisruption?: number;
  /** Share of maintenance staff absent, 0..1. */
  absenteeism?: number;
  maintenanceCrews?: number;
  targets?: {
    throughputPerShift?: number;
    maxAverageWip?: number;
    maxDownShare?: number;
  };
}

/** One visible adjustment a scenario made, for the UI to list. */
export interface Adjustment {
  node: string | null;
  param: string;
  factor: number;
  reason: string;
}

export interface AppliedScenario {
  /** A derived copy; the baseline graph is never changed. */
  graph: FactoryGraph;
  horizon: number;
  maintenanceCrews: number;
  adjustments: Adjustment[];
}

export function applyScenario(
  baseline: FactoryGraph,
  scenario: Scenario,
): AppliedScenario {
  const graph = structuredClone(baseline);
  const adjustments: Adjustment[] = [];
  const horizon = scenario.shiftHours * 3600;
  const scale = (
    node: string,
    name: string,
    current: Param,
    factor: number,
    reason: string,
  ) => {
    if (factor === 1) return;
    current.value *= factor;
    adjustments.push({ node, param: name, factor, reason });
  };

  const sources = graph.nodes.filter((node) => node.kind === "source");
  const degrees = Math.max(
    0,
    (scenario.ambientTempC ?? REFERENCE_TEMP_C) - REFERENCE_TEMP_C,
  );
  const supply = 1 - (scenario.supplyDisruption ?? 0);
  if (supply <= 0) throw new Error("Supply disruption must be below 100%");

  for (const node of graph.nodes) {
    if (node.kind === "source") {
      if (scenario.demandPerShift) {
        const wanted = (horizon * sources.length) / scenario.demandPerShift;
        scale(
          node.id,
          "interArrival",
          node.interArrival,
          wanted / node.interArrival.value,
          `Demand of ${scenario.demandPerShift} parts per shift`,
        );
      }
      scale(
        node.id,
        "interArrival",
        node.interArrival,
        1 / supply,
        `${Math.round((1 - supply) * 100)}% of supply disrupted`,
      );
    } else if (node.kind === "station") {
      const heat = `${degrees}°C above ${REFERENCE_TEMP_C}°C`;
      scale(
        node.id,
        "cycleTime",
        node.cycleTime,
        1 + CYCLE_GAIN_PER_DEGREE * degrees,
        heat,
      );
      if (node.mtbf) {
        scale(
          node.id,
          "mtbf",
          node.mtbf,
          Math.max(MTBF_FLOOR, 1 - MTBF_LOSS_PER_DEGREE * degrees),
          heat,
        );
      }
    }
  }

  const nominalCrews = scenario.maintenanceCrews ?? 1;
  const maintenanceCrews = Math.max(
    1,
    Math.round(nominalCrews * (1 - (scenario.absenteeism ?? 0))),
  );
  if (maintenanceCrews !== nominalCrews) {
    adjustments.push({
      node: null,
      param: "maintenanceCrews",
      factor: maintenanceCrews / nominalCrews,
      reason: `${Math.round((scenario.absenteeism ?? 0) * 100)}% absenteeism`,
    });
  }

  return { graph, horizon, maintenanceCrews, adjustments };
}
