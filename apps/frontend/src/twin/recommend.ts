import {
  type GraphDiff,
  type Kpis,
  type Param,
  type Scenario,
  type Spread,
  applyDiffs,
  applyScenario,
  averageKpis,
  simulateDays,
  spread,
} from "@repo/sim";
import type { Machine, RunDigest, ScoutKind } from "./api";
import type { Flow } from "./flow";
import {
  type SavedMachine,
  type StoredRun,
  daysOf,
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
  /**
   * Proposed by the report's rules, asked for in the design chat, or found
   * by the AI looking for equipment the plant does not have.
   */
  origin?: "suggested" | "asked" | "scouted";
  /** For scouted changes: new equipment, or spares on the shelf. */
  kind?: ScoutKind;
  /** For scouted changes: the problem it answers, with the run's numbers. */
  problem?: string;
  /** Pages its estimates came from. */
  sources?: { url: string; title?: string }[];
}

export interface MeasuredChange extends Change {
  /**
   * Parts per shift gained over the unchanged plant on standard rules,
   * averaged over the run's days.
   */
  gain: number;
  /** How the gain ranged day by day; missing from changes measured before. */
  range?: Spread;
}

/** A plant measured over the run's days: each day, and the average of them. */
export interface Measured {
  days: Kpis[];
  average: Kpis;
}

/** The unchanged plant over the run's days. */
export const baselineOf = (run: StoredRun): Measured => ({
  days: daysOf(run),
  average: averageKpis(daysOf(run)),
});

/** Parts per shift `after` gained over `before`, paired day by day. */
export const gainOf = (before: Measured, after: Measured): Spread =>
  spread(
    after.days.map(
      ({ completed }, day) => completed - (before.days[day]?.completed ?? 0),
    ),
  );

// A station blocked less than this is not worth a bigger buffer.
const WORTH_UNBLOCKING = 0.02;

/**
 * Re-runs the run's days with `changes` made to the plant. Standard rules
 * decide rather than the agents, so a change is measured in seconds and
 * against the same decisions every time; the seeds are the run's, so each day
 * starts from the same random events as on the unchanged plant.
 */
export async function measure(
  run: StoredRun,
  changes: Pick<Change, "diffs" | "extraCrews">[],
): Promise<Measured> {
  // The changes are made to the twin and the scenario then applied to it, as
  // applying them for good and running the shift does: new machines feel the
  // heat too, and extra crews are as short-handed as the rest.
  const applied = applyScenario(
    applyDiffs(
      run.graph,
      changes.flatMap(({ diffs }) => diffs),
    ),
    {
      ...run.scenario,
      maintenanceCrews:
        (run.scenario.maintenanceCrews ?? 1) +
        changes.reduce((sum, { extraCrews }) => sum + extraCrews, 0),
    },
  );
  const days = await simulateDays(
    applied.graph,
    {
      seed: run.seed,
      horizon: applied.horizon,
      maintenanceCrews: applied.maintenanceCrews,
      tickInterval: run.tickMinutes * 60,
    },
    daysOf(run).length,
  );
  return { days, average: averageKpis(days) };
}

/**
 * The run as the equipment scout reads it: each station's time on standard
 * rules averaged over the run's days, its breakdowns in the run itself, and
 * how the agents did.
 */
export function digestOf(run: StoredRun): RunDigest {
  const { days, average } = baselineOf(run);
  const failures = new Map<string, number>();
  for (const event of run.events) {
    if (event.type === "failure") {
      failures.set(event.node, (failures.get(event.node) ?? 0) + 1);
    }
  }
  const shipped = days.map(({ completed }) => completed);
  return {
    shipped: average.completed,
    range: { min: Math.min(...shipped), max: Math.max(...shipped) },
    days: days.length,
    bottleneck: average.bottleneck ?? undefined,
    stations: Object.entries(average.stations).map(([id, station]) => ({
      id,
      working: station.utilisation,
      blocked: station.blocked,
      idle: station.idle,
      down: station.down,
      stopped: station.stopped || undefined,
      failures: failures.get(id) ?? 0,
    })),
    supports: Object.entries(average.supports ?? {}).map(([id, support]) => ({
      id,
      down: support.down,
      failures: failures.get(id) ?? 0,
    })),
    decisions:
      run.agents.length > 0
        ? {
            total: run.decisions.length,
            fallbacks: run.decisions.filter(({ fallback }) => fallback).length,
          }
        : undefined,
  };
}

/** The changes worth measuring, picked from where the baseline run lost time. */
export function proposeChanges(run: StoredRun): Change[] {
  const { graph } = applyScenario(run.graph, run.scenario);
  const stations = graph.nodes.filter((node) => node.kind === "station");
  if (stations.length === 0) return [];
  // An average day, so one bad breakdown does not pick the changes.
  const average = baselineOf(run).average;
  const kpis = average.stations;
  const most = (share: "blocked" | "down") =>
    stations.reduce((worst, station) =>
      (kpis[station.id]?.[share] ?? 0) > (kpis[worst.id]?.[share] ?? 0)
        ? station
        : worst,
    );
  const changes: Change[] = [];

  const bottleneck = stations.find(({ id }) => id === average.bottleneck);
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
  const before = baselineOf(run);
  const measured = await Promise.all(
    proposeChanges(run).map(async (change) => {
      const range = gainOf(before, await measure(run, [change]));
      return { ...change, gain: range.mean, range };
    }),
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
  let links = twin.flow.links;
  let needs = twin.flow.needs ?? [];
  let positions = twin.flow.positions;
  // A new machine's estimated numbers, kept with where they came from.
  const estimates = (
    values: Partial<
      Record<
        "cycleTime" | "cycleTimeVariation" | "mtbf" | "mttr" | "scrapRate",
        number
      >
    >,
    provenance: Param["provenance"] = { kind: "assumed" },
  ) =>
    Object.fromEntries(
      Object.entries(values).flatMap(([key, value]) =>
        value === undefined
          ? []
          : [
              [
                key,
                {
                  value,
                  unit:
                    key === "scrapRate" || key === "cycleTimeVariation"
                      ? "share"
                      : "s",
                  provenance,
                },
              ],
            ],
      ),
    );
  for (const diff of changes.flatMap(({ diffs }) => diffs)) {
    if (diff.type === "insert-station") {
      machines = [
        ...machines,
        {
          id: diff.id,
          name: diff.name,
          count: diff.units,
          added: "redesign",
          params: estimates(
            {
              cycleTime: diff.cycleTime,
              cycleTimeVariation: diff.cycleTimeVariation,
              mtbf: diff.mtbf,
              mttr: diff.mttr,
              scrapRate: diff.scrapRate,
            },
            diff.provenance,
          ),
        },
      ];
      links = links.flatMap((link) =>
        link.from === diff.from && link.to === diff.to
          ? [
              { from: diff.from, to: diff.id },
              { from: diff.id, to: diff.to },
            ]
          : [link],
      );
      const from = positions[diff.from];
      const to = positions[diff.to];
      if (from && to) {
        positions = {
          ...positions,
          [diff.id]: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
        };
      }
    } else if (diff.type === "add-support") {
      machines = [
        ...machines,
        {
          id: diff.id,
          name: diff.name,
          count: diff.units,
          auxiliary: true,
          added: "redesign",
          params: estimates(
            { mtbf: diff.mtbf, mttr: diff.mttr },
            diff.provenance,
          ),
        },
      ];
      needs = [...needs, ...diff.neededBy.map((to) => ({ from: diff.id, to }))];
      // Beside the first machine that needs it, in the flow diagram.
      const beside = positions[diff.neededBy[0] ?? ""];
      if (beside) {
        positions = {
          ...positions,
          [diff.id]: { x: beside.x + 240, y: beside.y },
        };
      }
    } else if (diff.type === "add-units") {
      machines = machines.map((machine) =>
        machine.id === diff.station
          ? { ...machine, count: (machine.count ?? 1) + diff.count }
          : machine,
      );
    } else if (diff.type === "add-spare") {
      machines = machines.map((machine) =>
        machine.id === diff.support
          ? {
              ...machine,
              count: (machine.count ?? 1) + diff.count,
              spares: (machine.spares ?? 0) + diff.count,
            }
          : machine,
      );
    } else if (diff.type === "insert-buffer") {
      extras = [
        ...extras,
        { id: diff.id, kind: "buffer", name: diff.name, value: diff.capacity },
      ];
      links = links.flatMap((link) =>
        link.from === diff.from && link.to === diff.to
          ? [
              { from: diff.from, to: diff.id },
              { from: diff.id, to: diff.to },
            ]
          : [link],
      );
      // Halfway along the link it splits, in the flow diagram.
      const from = positions[diff.from];
      const to = positions[diff.to];
      if (from && to) {
        positions = {
          ...positions,
          [diff.id]: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
        };
      }
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
    flow: { ...twin.flow, extras, links, needs, positions },
    scenario: {
      ...twin.scenario,
      maintenanceCrews: (twin.scenario.maintenanceCrews ?? 1) + extraCrews,
    },
  };
}

/** A saved machine with whatever the twin step learned about it. */
type KnownMachine = SavedMachine &
  Partial<Pick<Machine, "type" | "manufacturer" | "model">>;

/**
 * What the API needs to price each change: the change, and the machine it
 * alters with its make and model, so the search can find real prices.
 */
export function costRequests(changes: Change[], machines: KnownMachine[]) {
  return changes.map(({ id, title, detail, diffs }) => {
    // New equipment is priced as itself, not as what it improves.
    const added = diffs.find(
      (diff) => diff.type === "insert-station" || diff.type === "add-support",
    );
    if (added?.type === "insert-station" || added?.type === "add-support") {
      return {
        id,
        title,
        detail,
        machine: {
          id: added.id,
          name: added.name,
          count: added.units,
          auxiliary: added.type === "add-support",
        },
      };
    }
    const diff = diffs[0];
    const target =
      diff?.type === "add-units"
        ? diff.station
        : diff?.type === "add-spare"
          ? diff.support
          : diff?.type === "set-param"
            ? diff.node
            : undefined;
    const machine = machines.find((candidate) => candidate.id === target);
    return {
      id,
      title,
      detail,
      machine: machine && {
        id: machine.id,
        name: machine.name,
        type: machine.type,
        manufacturer: machine.manufacturer,
        model: machine.model,
        count: machine.count,
        auxiliary: machine.auxiliary,
      },
    };
  });
}
