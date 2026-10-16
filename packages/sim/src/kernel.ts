import {
  type FactoryGraph,
  type StationNode,
  type SupportNode,
  validateGraph,
} from "./graph";
import { type Kpis, type StationTimes, computeKpis } from "./kpi";
import { createRandom } from "./random";

// Preventive maintenance takes this share of a full repair.
const PREVENTIVE_SHARE = 0.25;
// Repair time assumed for a station that can fail but states no MTTR.
const DEFAULT_MTTR_S = 600;
// Release rates a supervisor can choose between, relative to nominal.
const RELEASE_FACTORS = [0.8, 1, 1.2];

export interface SimConfig {
  /** Same seed and same decisions replay the same run. */
  seed: number;
  /** Simulated seconds to run for. */
  horizon: number;
  /** Crews that repair and maintain stations, one job each at a time. */
  maintenanceCrews?: number;
  /** Seconds between supervisor check-ins; omit or 0 for none. */
  tickInterval?: number;
  /** Keep every event in the result; turn off for very long runs. */
  recordEvents?: boolean;
  onEvent?: (event: SimEvent) => void;
}

/**
 * A station's state, or a support's: support equipment is "running" while
 * every unit is up. "stopped" is a station that is fine itself but needs
 * support equipment that is down.
 */
export type StationStatus =
  | "idle"
  | "running"
  | "blocked"
  | "down"
  | "repairing"
  | "preventive"
  | "stopped";

export type SimEvent = { time: number } & (
  | { type: "created" | "completed"; node: string; part: number }
  | { type: "start" | "finish" | "scrap"; node: string; part: number }
  | { type: "status"; node: string; status: StationStatus }
  | {
      type: "failure" | "repair-start" | "repair-end";
      node: string;
      /** Which unit, for support equipment. */
      unit?: number;
    }
  | {
      type: "preventive-start" | "preventive-end";
      node: string;
      unit?: number;
    }
  | {
      type: "decision";
      kind: DecisionRequest["kind"];
      role: Role;
      chosen: string;
      reason?: string;
    }
);

export type Role = "planner" | "maintenance" | "supervisor";

export interface CrewJob {
  /** The station or support equipment the job is on. */
  station: string;
  /**
   * The support unit to repair. A preventive job on support equipment takes
   * whichever unit has run longest when the crew gets there.
   */
  unit?: number;
  job: "repair" | "preventive";
  waitingSince: number;
}

export type TickAction =
  | { type: "none" }
  | { type: "preventive"; station: string }
  | { type: "set-release"; source: string; factor: number };

/** What the factory looks like at the moment a decision is asked for. */
export interface Snapshot {
  time: number;
  completed: number;
  scrapped: number;
  wip: number;
  freeCrews: number;
  stations: {
    id: string;
    name: string;
    status: StationStatus;
    busyUnits: number;
    units: number;
  }[];
  buffers: { id: string; name: string; level: number; capacity: number }[];
  sources: {
    id: string;
    name: string;
    blocked: boolean;
    /** Not releasing because support equipment it needs is down. */
    stopped: boolean;
    releaseFactor: number;
  }[];
  /** Missing from snapshots taken before support equipment existed. */
  supports?: {
    id: string;
    name: string;
    status: StationStatus;
    unitsDown: number;
    units: number;
    /** Names of the stations and sources that stop while it is down. */
    neededBy: string[];
  }[];
}

/** A point where the run pauses for someone to choose one of `options`. */
export type DecisionRequest =
  | {
      kind: "assign-crew";
      role: "maintenance";
      options: CrewJob[];
      snapshot: Snapshot;
    }
  | {
      kind: "plan-release";
      role: "planner";
      options: TickAction[];
      snapshot: Snapshot;
    }
  | {
      kind: "shift-tick";
      role: "supervisor";
      options: TickAction[];
      snapshot: Snapshot;
    };

export interface Decision {
  /** Index into the request's `options`. */
  choice: number;
  reason?: string;
}

export interface Policy {
  decide(request: DecisionRequest): Decision | Promise<Decision>;
}

/**
 * The no-agent baseline: crews take the job that has waited longest, release
 * stays at its nominal rate, and nothing is serviced before it fails.
 */
export const defaultPolicy: Policy = { decide: () => ({ choice: 0 }) };

export interface RunResult {
  kpis: Kpis;
  events: SimEvent[];
  decisions: number;
}

interface Part {
  id: number;
  target: string;
}

interface Scheduled {
  time: number;
  order: number;
  run: () => void;
  cancelled: boolean;
}

interface StationState extends StationTimes {
  node: StationNode;
  units: number;
  processing: Map<number, { part: Part; end: number; scheduled: Scheduled }>;
  /** Parts interrupted mid-cycle while the station is not up. */
  paused: { part: Part; remaining: number }[];
  /** Finished parts still occupying a unit because downstream is full. */
  done: Part[];
  condition: Condition | "stopped";
  failureToken: number;
  reported: StationStatus;
  /** Support equipment it cannot run without. */
  needs: string[];
}

type Condition = "up" | "down" | "repairing" | "preventive";

interface SupportUnit {
  condition: Condition;
  failureToken: number;
  /** When it was last repaired or serviced, or the run began. */
  wornSince: number;
}

interface SupportState {
  node: SupportNode;
  units: SupportUnit[];
  /** Stations and sources that stop while any unit is not up. */
  neededBy: string[];
  downTime: number;
  reported: StationStatus;
}

/** Runs the factory for `config.horizon` simulated seconds. */
export async function simulate(
  graph: FactoryGraph,
  config: SimConfig,
  policy: Policy = defaultPolicy,
): Promise<RunResult> {
  const problems = validateGraph(graph);
  if (problems.length > 0) {
    throw new Error(`Invalid factory graph: ${problems.join("; ")}`);
  }

  const random = createRandom(config.seed);
  const events: SimEvent[] = [];
  const emit = (event: SimEvent) => {
    if (config.recordEvents !== false) events.push(event);
    config.onEvent?.(event);
  };

  let now = 0;
  let nextPart = 1;
  let completed = 0;
  let scrapped = 0;
  let wip = 0;
  let wipTime = 0;
  let decisions = 0;
  let freeCrews = config.maintenanceCrews ?? 1;
  let tickDue = false;
  const jobs: CrewJob[] = [];

  // --- event queue: a binary heap ordered by time, then insertion ---
  const heap: Scheduled[] = [];
  let scheduledCount = 0;
  const before = (a: Scheduled, b: Scheduled) =>
    a.time < b.time || (a.time === b.time && a.order < b.order);
  function schedule(time: number, run: () => void): Scheduled {
    const entry = { time, order: scheduledCount++, run, cancelled: false };
    let index = heap.push(entry) - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (before(heap[parent]!, entry)) break;
      heap[index] = heap[parent]!;
      index = parent;
    }
    heap[index] = entry;
    return entry;
  }
  function popNext(): Scheduled | undefined {
    const top = heap[0];
    const last = heap.pop();
    if (!top || !last || heap.length === 0) return top;
    let index = 0;
    for (;;) {
      let child = 2 * index + 1;
      if (child >= heap.length) break;
      if (child + 1 < heap.length && before(heap[child + 1]!, heap[child]!)) {
        child += 1;
      }
      if (before(last, heap[child]!)) break;
      heap[index] = heap[child]!;
      index = child;
    }
    heap[index] = last;
    return top;
  }

  // --- state ---
  const outgoing = new Map<string, { to: string; share: number }[]>();
  for (const node of graph.nodes) outgoing.set(node.id, []);
  for (const edge of graph.edges) {
    outgoing.get(edge.from)!.push({ to: edge.to, share: edge.share ?? 1 });
  }
  const needs = new Map<string, string[]>();
  for (const { support, neededBy } of graph.dependencies ?? []) {
    const list = needs.get(neededBy) ?? [];
    if (!list.includes(support)) list.push(support);
    needs.set(neededBy, list);
  }
  const stations = new Map<string, StationState>();
  const buffers = new Map<string, { capacity: number; queue: Part[] }>();
  const sources = new Map<
    string,
    {
      held: Part | null;
      releaseFactor: number;
      needs: string[];
      stopped: boolean;
      /** A part came due while stopped; it is released once restarted. */
      arrivalDue: boolean;
    }
  >();
  const supports = new Map<string, SupportState>();
  for (const node of graph.nodes) {
    if (node.kind === "station") {
      stations.set(node.id, {
        node,
        units: Math.max(1, Math.round(node.units.value)),
        processing: new Map(),
        paused: [],
        done: [],
        condition: "up",
        failureToken: 0,
        reported: "idle",
        needs: needs.get(node.id) ?? [],
        busyTime: 0,
        blockedTime: 0,
        downTime: 0,
        stoppedTime: 0,
        stoppedBy: {},
      });
    } else if (node.kind === "buffer") {
      buffers.set(node.id, { capacity: node.capacity.value, queue: [] });
    } else if (node.kind === "source") {
      sources.set(node.id, {
        held: null,
        releaseFactor: 1,
        needs: needs.get(node.id) ?? [],
        stopped: false,
        arrivalDue: false,
      });
    } else if (node.kind === "support") {
      supports.set(node.id, {
        node,
        units: Array.from(
          { length: Math.max(1, Math.round(node.units.value)) },
          () => ({ condition: "up", failureToken: 0, wornSince: 0 }),
        ),
        neededBy: [...needs]
          .filter(([, list]) => list.includes(node.id))
          .map(([id]) => id),
        downTime: 0,
        reported: "running",
      });
    }
  }

  const supportUp = (support: SupportState) =>
    support.units.every(({ condition }) => condition === "up");
  const supplied = (ids: string[]) =>
    ids.every((id) => supportUp(supports.get(id)!));

  function advance(time: number) {
    const elapsed = time - now;
    if (elapsed <= 0) return;
    wipTime += wip * elapsed;
    for (const station of stations.values()) {
      station.busyTime += station.processing.size * elapsed;
      station.blockedTime += station.done.length * elapsed;
      if (station.condition === "stopped") {
        station.stoppedTime += elapsed;
        for (const id of station.needs) {
          if (supportUp(supports.get(id)!)) continue;
          station.stoppedBy[id] = (station.stoppedBy[id] ?? 0) + elapsed;
        }
      } else if (station.condition !== "up") {
        station.downTime += elapsed;
      }
    }
    for (const support of supports.values()) {
      if (!supportUp(support)) support.downTime += elapsed;
    }
    now = time;
  }

  function pickTarget(from: string): string {
    const routes = outgoing.get(from)!;
    if (routes.length === 1) return routes[0]!.to;
    const total = routes.reduce((sum, route) => sum + route.share, 0);
    let roll = random.next() * total;
    for (const route of routes) {
      roll -= route.share;
      if (roll < 0) return route.to;
    }
    return routes[routes.length - 1]!.to;
  }

  function accepts(id: string): boolean {
    const station = stations.get(id);
    if (station) {
      const occupied =
        station.processing.size + station.paused.length + station.done.length;
      return station.condition === "up" && occupied < station.units;
    }
    const buffer = buffers.get(id);
    if (buffer) return buffer.queue.length < buffer.capacity;
    return !sources.has(id);
  }

  // --- parts ---
  function scheduleArrival(id: string) {
    const source = sources.get(id)!;
    const node = graph.nodes.find((candidate) => candidate.id === id)!;
    if (node.kind !== "source") return;
    const mean = node.interArrival.value / source.releaseFactor;
    schedule(now + random.exponential(mean), () => {
      if (source.stopped) {
        source.arrivalDue = true;
        return;
      }
      release(id);
    });
  }

  function release(id: string) {
    const part = { id: nextPart++, target: pickTarget(id) };
    wip += 1;
    sources.get(id)!.held = part;
    emit({ time: now, type: "created", node: id, part: part.id });
  }

  function beginCycle(station: StationState, part: Part, duration: number) {
    const end = now + duration;
    const scheduled = schedule(end, () => {
      station.processing.delete(part.id);
      const scrapRate = station.node.scrapRate?.value ?? 0;
      if (scrapRate > 0 && random.next() < scrapRate) {
        scrapped += 1;
        wip -= 1;
        emit({
          time: now,
          type: "scrap",
          node: station.node.id,
          part: part.id,
        });
        return;
      }
      part.target = pickTarget(station.node.id);
      station.done.push(part);
      emit({ time: now, type: "finish", node: station.node.id, part: part.id });
    });
    station.processing.set(part.id, { part, end, scheduled });
  }

  function deliver(part: Part) {
    const id = part.target;
    const station = stations.get(id);
    const buffer = buffers.get(id);
    if (station) {
      const variation = station.node.cycleTimeVariation?.value ?? 0;
      beginCycle(
        station,
        part,
        random.spread(station.node.cycleTime.value, variation),
      );
      emit({ time: now, type: "start", node: id, part: part.id });
    } else if (buffer) {
      part.target = pickTarget(id);
      buffer.queue.push(part);
    } else {
      completed += 1;
      wip -= 1;
      emit({ time: now, type: "completed", node: id, part: part.id });
    }
  }

  /** Moves every part that can move, until nothing more fits anywhere. */
  function settle() {
    let moved = true;
    while (moved) {
      moved = false;
      for (const [id, source] of sources) {
        if (source.held && accepts(source.held.target)) {
          deliver(source.held);
          source.held = null;
          scheduleArrival(id);
          moved = true;
        }
      }
      for (const buffer of buffers.values()) {
        while (buffer.queue[0] && accepts(buffer.queue[0].target)) {
          deliver(buffer.queue.shift()!);
          moved = true;
        }
      }
      for (const station of stations.values()) {
        while (station.done[0] && accepts(station.done[0].target)) {
          deliver(station.done.shift()!);
          moved = true;
        }
      }
    }
  }

  // --- failures and maintenance ---
  function armFailure(station: StationState) {
    const mtbf = station.node.mtbf?.value;
    if (!mtbf) return;
    const token = ++station.failureToken;
    schedule(now + random.wearOut(mtbf), () => {
      // A repair or service since this was armed reset the wear clock.
      if (token !== station.failureToken) return;
      // A station stopped for want of support can still be found broken.
      if (station.condition !== "up" && station.condition !== "stopped") {
        return;
      }
      halt(station, "down");
      jobs.push({ station: station.node.id, job: "repair", waitingSince: now });
      emit({ time: now, type: "failure", node: station.node.id });
    });
  }

  function halt(station: StationState, condition: StationState["condition"]) {
    station.condition = condition;
    for (const { part, end, scheduled } of station.processing.values()) {
      scheduled.cancelled = true;
      station.paused.push({ part, remaining: end - now });
    }
    station.processing.clear();
  }

  /** After its own repair or service: running again, if its support is. */
  function resume(station: StationState) {
    if (supplied(station.needs)) restart(station);
    else station.condition = "stopped";
    armFailure(station);
  }

  function restart(station: StationState) {
    station.condition = "up";
    for (const { part, remaining } of station.paused) {
      beginCycle(station, part, remaining);
    }
    station.paused = [];
  }

  /** Stops or restarts what needs `support`, after one of its units changed. */
  function supportChanged(support: SupportState) {
    const up = supportUp(support);
    for (const id of support.neededBy) {
      const station = stations.get(id);
      if (station) {
        if (!up && station.condition === "up") halt(station, "stopped");
        if (up && station.condition === "stopped" && supplied(station.needs)) {
          restart(station);
        }
      }
      const source = sources.get(id);
      if (source) {
        source.stopped = !supplied(source.needs);
        if (!source.stopped && source.arrivalDue) {
          source.arrivalDue = false;
          release(id);
        }
      }
    }
  }

  function armSupportFailure(support: SupportState, unit: SupportUnit) {
    unit.wornSince = now;
    const token = ++unit.failureToken;
    const mtbf = support.node.mtbf?.value;
    if (!mtbf) return;
    schedule(now + random.wearOut(mtbf), () => {
      if (token !== unit.failureToken || unit.condition !== "up") return;
      unit.condition = "down";
      const index = support.units.indexOf(unit);
      const id = support.node.id;
      jobs.push({ station: id, unit: index, job: "repair", waitingSince: now });
      emit({ time: now, type: "failure", node: id, unit: index });
      supportChanged(support);
    });
  }

  function startSupportJob(support: SupportState, job: CrewJob) {
    const mttr = support.node.mttr?.value ?? DEFAULT_MTTR_S;
    let unit: SupportUnit | undefined;
    let duration: number;
    if (job.job === "repair") {
      unit = support.units[job.unit ?? 0]!;
      unit.condition = "repairing";
      duration = random.exponential(mttr);
    } else {
      // The unit that has run longest since its last repair or service.
      for (const candidate of support.units) {
        if (candidate.condition !== "up") continue;
        if (!unit || candidate.wornSince < unit.wornSince) unit = candidate;
      }
      if (!unit) return;
      unit.condition = "preventive";
      duration = mttr * PREVENTIVE_SHARE;
      supportChanged(support);
    }
    const serviced = unit;
    const index = support.units.indexOf(serviced);
    const id = support.node.id;
    freeCrews -= 1;
    emit({ time: now, type: `${job.job}-start`, node: id, unit: index });
    schedule(now + duration, () => {
      freeCrews += 1;
      serviced.condition = "up";
      armSupportFailure(support, serviced);
      emit({ time: now, type: `${job.job}-end`, node: id, unit: index });
      supportChanged(support);
    });
  }

  function startJob(job: CrewJob) {
    const support = supports.get(job.station);
    if (support) return startSupportJob(support, job);
    const station = stations.get(job.station)!;
    const mttr = station.node.mttr?.value ?? DEFAULT_MTTR_S;
    const id = station.node.id;
    let duration: number;
    if (job.job === "repair") {
      station.condition = "repairing";
      duration = random.exponential(mttr);
    } else {
      // A station that failed while waiting gets repaired instead. One
      // stopped for want of support loses nothing by being serviced.
      if (station.condition !== "up" && station.condition !== "stopped") {
        return;
      }
      halt(station, "preventive");
      duration = mttr * PREVENTIVE_SHARE;
    }
    freeCrews -= 1;
    emit({ time: now, type: `${job.job}-start`, node: id });
    schedule(now + duration, () => {
      freeCrews += 1;
      resume(station);
      emit({ time: now, type: `${job.job}-end`, node: id });
    });
  }

  // --- decisions ---
  function statusOf(station: StationState): StationStatus {
    if (station.condition !== "up") return station.condition;
    if (station.processing.size > 0) return "running";
    return station.done.length > 0 ? "blocked" : "idle";
  }

  /** The worst of its units: a failure outranks a repair, a repair a service. */
  function supportStatus(support: SupportState): StationStatus {
    for (const condition of ["down", "repairing", "preventive"] as const) {
      if (support.units.some((unit) => unit.condition === condition)) {
        return condition;
      }
    }
    return "running";
  }

  function snapshot(): Snapshot {
    const name = (id: string) =>
      graph.nodes.find((node) => node.id === id)!.name;
    return {
      time: now,
      completed,
      scrapped,
      wip,
      freeCrews,
      stations: [...stations.values()].map((station) => ({
        id: station.node.id,
        name: station.node.name,
        status: statusOf(station),
        busyUnits: station.processing.size,
        units: station.units,
      })),
      buffers: [...buffers].map(([id, buffer]) => ({
        id,
        name: name(id),
        level: buffer.queue.length,
        capacity: buffer.capacity,
      })),
      sources: [...sources].map(([id, source]) => ({
        id,
        name: name(id),
        blocked: source.held !== null,
        stopped: source.stopped,
        releaseFactor: source.releaseFactor,
      })),
      supports: [...supports.values()].map((support) => ({
        id: support.node.id,
        name: support.node.name,
        status: supportStatus(support),
        unitsDown: support.units.filter(({ condition }) => condition !== "up")
          .length,
        units: support.units.length,
        neededBy: support.neededBy.map(name),
      })),
    };
  }

  async function ask<Request extends DecisionRequest>(
    request: Request,
    describe: (option: Request["options"][number]) => string,
  ): Promise<Request["options"][number]> {
    const decision = await policy.decide(request);
    decisions += 1;
    // An out-of-range answer falls back to the baseline choice.
    const chosen = request.options[decision.choice] ?? request.options[0]!;
    emit({
      time: now,
      type: "decision",
      kind: request.kind,
      role: request.role,
      chosen: describe(chosen),
      reason: decision.reason,
    });
    return chosen;
  }

  async function dispatchCrews() {
    while (freeCrews > 0 && jobs.length > 0) {
      // One waiting job is no choice; only a real choice is put to the policy.
      const job =
        jobs.length === 1
          ? jobs[0]!
          : await ask(
              {
                kind: "assign-crew",
                role: "maintenance",
                options: [...jobs],
                snapshot: snapshot(),
              },
              (option) => `${option.job} ${option.station}`,
            );
      jobs.splice(jobs.indexOf(job), 1);
      startJob(job);
    }
  }

  const describeAction = (action: TickAction) =>
    action.type === "preventive"
      ? `preventive ${action.station}`
      : action.type === "set-release"
        ? `release ${action.source} x${action.factor}`
        : "none";

  /** The periodic check-in: the planner paces release, the supervisor schedules servicing. */
  async function shiftTick() {
    const release: TickAction[] = [{ type: "none" }];
    for (const [id, source] of sources) {
      for (const factor of RELEASE_FACTORS) {
        if (factor !== source.releaseFactor) {
          release.push({ type: "set-release", source: id, factor });
        }
      }
    }
    const paced = await ask(
      {
        kind: "plan-release",
        role: "planner",
        options: release,
        snapshot: snapshot(),
      },
      describeAction,
    );
    if (paced.type === "set-release") {
      sources.get(paced.source)!.releaseFactor = paced.factor;
    }

    const servicing: TickAction[] = [{ type: "none" }];
    const queued = (id: string) => jobs.some((job) => job.station === id);
    for (const station of stations.values()) {
      const healthy =
        station.condition === "up" || station.condition === "stopped";
      if (healthy && station.node.mtbf && !queued(station.node.id)) {
        servicing.push({ type: "preventive", station: station.node.id });
      }
    }
    for (const support of supports.values()) {
      const healthy = support.units.some(({ condition }) => condition === "up");
      if (healthy && support.node.mtbf && !queued(support.node.id)) {
        servicing.push({ type: "preventive", station: support.node.id });
      }
    }
    // With nothing serviceable there is no choice to put to the supervisor.
    if (servicing.length === 1) return;
    const serviced = await ask(
      {
        kind: "shift-tick",
        role: "supervisor",
        options: servicing,
        snapshot: snapshot(),
      },
      describeAction,
    );
    if (serviced.type === "preventive") {
      jobs.push({
        station: serviced.station,
        job: "preventive",
        waitingSince: now,
      });
    }
  }

  // --- run ---
  for (const id of sources.keys()) scheduleArrival(id);
  for (const station of stations.values()) armFailure(station);
  for (const support of supports.values()) {
    for (const unit of support.units) armSupportFailure(support, unit);
  }
  const tickInterval = config.tickInterval ?? 0;
  if (tickInterval > 0) {
    const tick = () => {
      // A check-in on the final instant could not change anything.
      tickDue = now < config.horizon;
      schedule(now + tickInterval, tick);
    };
    schedule(tickInterval, tick);
  }

  for (;;) {
    const next = popNext();
    if (!next || next.time > config.horizon) break;
    if (next.cancelled) continue;
    advance(next.time);
    next.run();
    if (tickDue) {
      tickDue = false;
      await shiftTick();
    }
    await dispatchCrews();
    settle();
    for (const station of stations.values()) {
      const status = statusOf(station);
      if (status === station.reported) continue;
      station.reported = status;
      emit({ time: now, type: "status", node: station.node.id, status });
    }
    for (const support of supports.values()) {
      const status = supportStatus(support);
      if (status === support.reported) continue;
      support.reported = status;
      emit({ time: now, type: "status", node: support.node.id, status });
    }
  }
  advance(config.horizon);

  return {
    events,
    decisions,
    kpis: computeKpis({
      horizon: config.horizon,
      completed,
      scrapped,
      wipTime,
      stations: [...stations.values()].map((station) => ({
        id: station.node.id,
        units: station.units,
        busyTime: station.busyTime,
        blockedTime: station.blockedTime,
        downTime: station.downTime,
        stoppedTime: station.stoppedTime,
        stoppedBy: station.stoppedBy,
      })),
      supports: [...supports.values()].map((support) => ({
        id: support.node.id,
        downTime: support.downTime,
      })),
    }),
  };
}
