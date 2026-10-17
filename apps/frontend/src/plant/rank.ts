import {
  type Kpis,
  type Scenario,
  applyDiffs,
  applyScenario,
  averageKpis,
  simulateDays,
} from "@repo/sim";
import type { CostEstimate } from "@/twin/api";
import type { SavedMachine, StoredRun } from "@/twin/project";
import type { Change } from "@/twin/recommend";

/** Days a redesign applied before the days setting existed is averaged over. */
const OLD_DAYS = 5;
/** At most this many applied redesigns are kept. */
export const KEPT_APPLIED = 10;

export type Tier = "critical" | "high" | "medium" | "low";

export const TIER_LABEL: Record<Tier, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export interface RankedRow {
  id: string;
  tier: Tier;
  /** Parts per shift the redesign loses without this change. */
  marginal: number;
  /** Parts per shift it gains on its own. */
  solo: number;
  /** The scenario targets the redesign misses without it. */
  needed: string[];
}

export interface PlantReport {
  rows: RankedRow[];
  before: number;
  after: number;
  /** Targets met before and after, by name. */
  targets: { name: string; before: boolean; after: boolean }[];
  summary?: string;
  paragraphs?: Record<string, string>;
}

/** A redesign as it was applied to the twin, kept for the last step. */
export interface AppliedRedesign {
  id: string;
  at: number;
  changes: Change[];
  /** The run the redesign was measured against, on the twin before it. */
  run: Pick<StoredRun, "seed" | "tickMinutes" | "scenario" | "graph" | "baseline"> & {
    /** Days every measurement is averaged over, as the run was. */
    days?: number;
  };
  /** The machines before the change, with their pins in the world. */
  machines: Pick<SavedMachine, "id" | "name" | "pins" | "count" | "auxiliary" | "spares">[];
  costs: Record<string, CostEstimate>;
  currency: string;
  /** Measured on the last step, once. */
  report?: PlantReport;
}

type Measured = Pick<Change, "diffs" | "extraCrews">;

/** Days each measurement of `run` is averaged over, so one lucky day cannot decide. */
export const daysFor = (run: AppliedRedesign["run"]) => run.days ?? OLD_DAYS;

/** `measure`, averaged over the run's days starting at its seed. */
export async function measureDays(
  run: AppliedRedesign["run"],
  changes: Measured[],
): Promise<Kpis> {
  const applied = applyScenario(run.graph, run.scenario);
  const graph = applyDiffs(
    applied.graph,
    changes.flatMap(({ diffs }) => diffs),
  );
  const days = await simulateDays(
    graph,
    {
      seed: run.seed,
      horizon: applied.horizon,
      maintenanceCrews:
        applied.maintenanceCrews +
        changes.reduce((sum, { extraCrews }) => sum + extraCrews, 0),
      tickInterval: run.tickMinutes * 60,
    },
    daysFor(run),
  );
  return averageKpis(days);
}

/** Each of the scenario's targets, and whether a plant meets it. */
function targetsOf({ targets }: Scenario) {
  const checks: { name: string; met: (kpis: Kpis) => boolean }[] = [];
  if (targets?.throughputPerShift) {
    const wanted = targets.throughputPerShift;
    checks.push({
      name: `${wanted} parts per shift`,
      met: (kpis) => kpis.completed >= wanted,
    });
  }
  if (targets?.maxAverageWip) {
    const most = targets.maxAverageWip;
    checks.push({
      name: `under ${most} parts in progress`,
      met: (kpis) => kpis.averageWip <= most,
    });
  }
  if (targets?.maxDownShare) {
    const most = targets.maxDownShare;
    checks.push({
      name: `no station down over ${Math.round(most * 100)}%`,
      met: (kpis) =>
        Object.values(kpis.stations).every(({ down }) => down <= most),
    });
  }
  return checks;
}

const TIER_ORDER: Tier[] = ["critical", "high", "medium", "low"];
// A change that loses less than this when taken out barely matters.
const NOTICEABLE = 1;

/**
 * Ranks the applied changes by how much the redesign needs each one: those
 * it misses a target without come first, then by the parts per shift it
 * loses without them. Taking one out, rather than adding it alone, counts
 * the changes that only work together.
 */
export async function rankChanges(
  applied: AppliedRedesign,
  onProgress?: (done: number, total: number) => void,
): Promise<PlantReport> {
  const { run, changes } = applied;
  const total = 2 + changes.length * 2;
  let done = 0;
  const step = async (work: Promise<Kpis>) => {
    const kpis = await work;
    onProgress?.(++done, total);
    // Lets the page paint between measurements.
    await new Promise((resolve) => setTimeout(resolve, 0));
    return kpis;
  };
  const base = await step(measureDays(run, []));
  const full = await step(measureDays(run, changes));
  const checks = targetsOf(run.scenario);
  const measured: Omit<RankedRow, "tier">[] = [];
  for (const change of changes) {
    const without = await step(
      measureDays(
        run,
        changes.filter(({ id }) => id !== change.id),
      ),
    ).catch(() => null);
    const alone = await step(measureDays(run, [change])).catch(() => null);
    measured.push({
      id: change.id,
      // A change the others cannot run without is needed by all of them.
      marginal: without ? full.completed - without.completed : full.completed - base.completed,
      solo: alone ? alone.completed - base.completed : 0,
      needed: without
        ? checks
            .filter(({ met }) => met(full) && !met(without))
            .map(({ name }) => name)
        : [],
    });
  }
  const best = Math.max(0, ...measured.map(({ marginal }) => marginal));
  const rows = measured.map((row): RankedRow => ({
    ...row,
    tier:
      row.needed.length > 0
        ? "critical"
        : row.marginal >= NOTICEABLE && row.marginal >= best / 2
          ? "high"
          : row.marginal >= NOTICEABLE
            ? "medium"
            : "low",
  }));
  rows.sort(
    (a, b) =>
      TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) ||
      b.marginal - a.marginal ||
      b.solo - a.solo,
  );
  return {
    rows,
    before: base.completed,
    after: full.completed,
    targets: checks.map(({ name, met }) => ({
      name,
      before: met(base),
      after: met(full),
    })),
  };
}
