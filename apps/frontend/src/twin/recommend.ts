import {
  type GraphDiff,
  type Kpis,
  type Scenario,
  applyDiffs,
  applyScenario,
  simulate,
} from "@repo/sim";
import type { Flow } from "./flow";
import {
  type SavedMachine,
  type StoredRun,
  percent,
  stationParam,
} from "./project";

/** One change to the plant that the report can measure. */
export interface Change {
  id: string;
  title: string;
  /** Why this change is worth trying, from the run's own numbers. */
  detail: string;
  diffs: GraphDiff[];
  /** Maintenance crews added on top of the scenario's. */
  extraCrews: number;
}

export interface MeasuredChange extends Change {
  /** Parts per shift gained over the unchanged plant, on standard rules. */
  gain: number;
}

// A station blocked less than this is not worth a bigger buffer.
const WORTH_UNBLOCKING = 0.02;

/**
 * Re-runs the shift with `changes` made to the plant. Standard rules decide
 * rather than the agents, so a change is measured in seconds and against the
 * same decisions every time; the seed is the run's, so the same failures hit.
 */
export async function measure(
  run: StoredRun,
  changes: Pick<Change, "diffs" | "extraCrews">[],
): Promise<Kpis> {
  const applied = applyScenario(run.graph, run.scenario);
  const graph = applyDiffs(
    applied.graph,
    changes.flatMap(({ diffs }) => diffs),
  );
  const { kpis } = await simulate(graph, {
    seed: run.seed,
    horizon: applied.horizon,
    maintenanceCrews:
      applied.maintenanceCrews +
      changes.reduce((sum, { extraCrews }) => sum + extraCrews, 0),
    tickInterval: run.tickMinutes * 60,
    recordEvents: false,
  });
  return kpis;
}

/** The changes worth measuring, picked from where the baseline run lost time. */
export function proposeChanges(run: StoredRun): Change[] {
  const { graph } = applyScenario(run.graph, run.scenario);
  const stations = graph.nodes.filter((node) => node.kind === "station");
  if (stations.length === 0) return [];
  const kpis = run.baseline.stations;
  const most = (share: "blocked" | "down") =>
    stations.reduce((worst, station) =>
      (kpis[station.id]?.[share] ?? 0) > (kpis[worst.id]?.[share] ?? 0)
        ? station
        : worst,
    );
  const changes: Change[] = [];

  const bottleneck = stations.find(({ id }) => id === run.baseline.bottleneck);
  if (bottleneck) {
    const units = bottleneck.units.value;
    changes.push({
      id: `units-${bottleneck.id}`,
      title: `Add one more unit to ${bottleneck.name}`,
      detail: `${bottleneck.name} has the least spare capacity: its ${units} ${units === 1 ? "unit is" : "units are"} busy ${percent(kpis[bottleneck.id]?.utilisation ?? 0)} of the shift and down ${percent(kpis[bottleneck.id]?.down ?? 0)}.`,
      diffs: [{ type: "add-units", station: bottleneck.id, count: 1 }],
      extraCrews: 0,
    });
  }

  // A blocked station is waiting for room downstream; failing that, the
  // buffer feeding the bottleneck is the one that runs dry or overflows.
  const blocked = most("blocked");
  const isBlocked = (kpis[blocked.id]?.blocked ?? 0) > WORTH_UNBLOCKING;
  const buffer = graph.nodes.find(
    (node) =>
      node.kind === "buffer" &&
      graph.edges.some(({ from, to }) =>
        isBlocked
          ? from === blocked.id && to === node.id
          : from === node.id && to === bottleneck?.id,
      ),
  );
  if (buffer?.kind === "buffer") {
    const capacity = buffer.capacity.value;
    changes.push({
      id: `buffer-${buffer.id}`,
      title: `Double ${buffer.name} to ${capacity * 2} parts`,
      detail: isBlocked
        ? `${blocked.name} sits blocked ${percent(kpis[blocked.id]?.blocked ?? 0)} of the shift waiting for room in ${buffer.name}.`
        : `${buffer.name} feeds the bottleneck; more room lets it ride out stoppages upstream.`,
      diffs: [
        { type: "resize-buffer", buffer: buffer.id, capacity: capacity * 2 },
      ],
      extraCrews: 0,
    });
  }

  const failing = most("down");
  if (failing.mttr && (kpis[failing.id]?.down ?? 0) > 0) {
    const minutes = Math.round(failing.mttr.value / 60);
    changes.push({
      id: `repair-${failing.id}`,
      title: `Halve repair time at ${failing.name}`,
      detail: `${failing.name} is down ${percent(kpis[failing.id]?.down ?? 0)} of the shift. Spares and tools kept at the station would cut a ${minutes}-minute repair to ${Math.round(minutes / 2)}.`,
      diffs: [
        {
          type: "set-param",
          node: failing.id,
          param: "mttr",
          value: failing.mttr.value / 2,
        },
      ],
      extraCrews: 0,
    });
  }

  changes.push({
    id: "crew",
    title: "Add a maintenance crew",
    detail:
      "A second crew only helps when breakdowns queue behind each other; the measurement shows whether they did.",
    diffs: [],
    extraCrews: 1,
  });
  return changes;
}

/** Every proposed change with its measured effect, best first. */
export async function measureChanges(
  run: StoredRun,
): Promise<MeasuredChange[]> {
  const measured = await Promise.all(
    proposeChanges(run).map(async (change) => ({
      ...change,
      gain: (await measure(run, [change])).completed - run.baseline.completed,
    })),
  );
  return measured.sort((a, b) => b.gain - a.gain);
}

/** The twin and scenario with `changes` made for good. */
export function applyToTwin(
  twin: { machines: SavedMachine[]; flow: Flow; scenario: Scenario },
  changes: Change[],
) {
  let machines = twin.machines;
  let extras = twin.flow.extras;
  for (const diff of changes.flatMap(({ diffs }) => diffs)) {
    if (diff.type === "add-units") {
      machines = machines.map((machine) =>
        machine.id === diff.station
          ? { ...machine, count: (machine.count ?? 1) + diff.count }
          : machine,
      );
    } else if (diff.type === "resize-buffer") {
      extras = extras.map((extra) =>
        extra.id === diff.buffer
          ? { ...extra, value: diff.capacity, suggested: false }
          : extra,
      );
    } else if (diff.param !== "interArrival") {
      const key = diff.param;
      machines = machines.map((machine) =>
        machine.id === diff.node
          ? {
              ...machine,
              params: {
                ...machine.params,
                [key]: {
                  ...stationParam(machine, key),
                  value: diff.value,
                  provenance: { kind: "user" as const },
                },
              },
            }
          : machine,
      );
    }
  }
  const extraCrews = changes.reduce(
    (sum, change) => sum + change.extraCrews,
    0,
  );
  return {
    machines,
    flow: { ...twin.flow, extras },
    scenario: {
      ...twin.scenario,
      maintenanceCrews: (twin.scenario.maintenanceCrews ?? 1) + extraCrews,
    },
  };
}
