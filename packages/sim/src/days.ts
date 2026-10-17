import type { FactoryGraph } from "./graph";
import { type Policy, type SimConfig, defaultPolicy, simulate } from "./kernel";
import type { Kpis, StationKpis } from "./kpi";

/** The average of a measure over several days, and how far it ranged. */
export interface Spread {
  mean: number;
  min: number;
  max: number;
}

const meanOf = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

export function spread(values: number[]): Spread {
  if (values.length === 0) throw new Error("Nothing to average");
  return {
    mean: meanOf(values),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

/**
 * The KPIs of an average day; a station or support missing from a day counts
 * as 0 there. The bottleneck is the station with the least spare capacity on
 * average, which need not be the one most often worst.
 */
export function averageKpis(runs: Kpis[]): Kpis {
  if (runs.length === 0) throw new Error("Nothing to average");
  const mean = (pick: (kpis: Kpis) => number | undefined) =>
    meanOf(runs.map((kpis) => pick(kpis) ?? 0));
  const ids = (pick: (kpis: Kpis) => object | undefined) => [
    ...new Set(runs.flatMap((kpis) => Object.keys(pick(kpis) ?? {}))),
  ];

  const stations: Record<string, StationKpis> = {};
  let bottleneck: string | null = null;
  let leastSpare = Infinity;
  for (const id of ids(({ stations }) => stations)) {
    const at = (kpis: Kpis) => kpis.stations[id];
    const station: StationKpis = {
      utilisation: mean((kpis) => at(kpis)?.utilisation),
      blocked: mean((kpis) => at(kpis)?.blocked),
      down: mean((kpis) => at(kpis)?.down),
      stopped: mean((kpis) => at(kpis)?.stopped),
      stoppedBy: Object.fromEntries(
        ids((kpis) => at(kpis)?.stoppedBy).map((support) => [
          support,
          mean((kpis) => at(kpis)?.stoppedBy[support]),
        ]),
      ),
      idle: mean((kpis) => at(kpis)?.idle),
    };
    stations[id] = station;
    // As in a single run: time blocked is spare, the fault of downstream.
    const spare = station.idle + station.blocked;
    if (spare < leastSpare) {
      leastSpare = spare;
      bottleneck = id;
    }
  }

  return {
    horizon: runs[0]!.horizon,
    completed: mean(({ completed }) => completed),
    scrapped: mean(({ scrapped }) => scrapped),
    throughputPerHour: mean(({ throughputPerHour }) => throughputPerHour),
    averageWip: mean(({ averageWip }) => averageWip),
    stations,
    supports: Object.fromEntries(
      ids(({ supports }) => supports).map((id) => [
        id,
        { down: mean(({ supports }) => supports?.[id]?.down) },
      ]),
    ),
    bottleneck,
  };
}

/**
 * Runs the same shift `days` times, on standard rules unless a `policy` is
 * given, each day on its own seed (`config.seed`, then the next, and so on),
 * so one lucky or unlucky day cannot pass for the plant's real performance.
 * Day one replays `config.seed`.
 */
export async function simulateDays(
  graph: FactoryGraph,
  config: Omit<SimConfig, "recordEvents" | "onEvent">,
  days: number,
  policy: Policy = defaultPolicy,
): Promise<Kpis[]> {
  const runs: Kpis[] = [];
  for (let day = 0; day < days; day++) {
    const { kpis } = await simulate(
      graph,
      { ...config, seed: config.seed + day, recordEvents: false },
      policy,
    );
    runs.push(kpis);
  }
  return runs;
}
