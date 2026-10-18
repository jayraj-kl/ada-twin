import { simulateDays } from "./days";
import { type GraphDiff, applyDiffs } from "./diff";
import type { FactoryGraph } from "./graph";
import { type Policy, type SimConfig, defaultPolicy } from "./kernel";
import type { Kpis } from "./kpi";
import { type Adjustment, type Scenario, applyScenario } from "./scenario";

/** Changes made to the twin: graph edits, and crews on top of the scenario's. */
export interface ChangeSet {
  diffs: GraphDiff[];
  /** Maintenance crews added to the scenario's. */
  extraCrews?: number;
}

/** A shift to simulate: the twin, the conditions, and any changes to it. */
export interface Shift {
  /** The twin, before the scenario and the changes. */
  graph: FactoryGraph;
  scenario: Scenario;
  changes?: ChangeSet[];
  /** Day one's seed; each further day takes the next. */
  seed: number;
  /** Minutes between supervisor check-ins. */
  tickMinutes: number;
}

/** The plant a shift runs on, with the settings to simulate it. */
export interface PreparedShift {
  graph: FactoryGraph;
  config: Required<Pick<SimConfig, "seed" | "horizon" | "maintenanceCrews" | "tickInterval">>;
  adjustments: Adjustment[];
}

/**
 * The plant as the shift meets it. Changes are made to the twin first and
 * the scenario is applied after, as applying them for good and running the
 * shift does: new machines feel the heat too, and extra crews are as
 * short-handed as the rest.
 */
export function prepareShift({
  graph,
  scenario,
  changes = [],
  seed,
  tickMinutes,
}: Shift): PreparedShift {
  const diffs = changes.flatMap((change) => change.diffs);
  const extraCrews = changes.reduce(
    (sum, change) => sum + (change.extraCrews ?? 0),
    0,
  );
  const applied = applyScenario(
    diffs.length > 0 ? applyDiffs(graph, diffs) : graph,
    extraCrews > 0
      ? {
          ...scenario,
          maintenanceCrews: (scenario.maintenanceCrews ?? 1) + extraCrews,
        }
      : scenario,
  );
  return {
    graph: applied.graph,
    config: {
      seed,
      horizon: applied.horizon,
      maintenanceCrews: applied.maintenanceCrews,
      tickInterval: tickMinutes * 60,
    },
    adjustments: applied.adjustments,
  };
}

/**
 * The shift run `days` times from its seed, on standard rules unless a
 * `policy` is given: each day's KPIs, so gains can be paired day by day.
 */
export async function simulateShiftDays(
  shift: Shift,
  days: number,
  policy: Policy = defaultPolicy,
): Promise<Kpis[]> {
  const { graph, config } = prepareShift(shift);
  return simulateDays(graph, config, days, policy);
}
