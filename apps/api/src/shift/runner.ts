import type { AgentSpec, DecisionRecord } from "@repo/agent";
import {
  type Adjustment,
  type FactoryGraph,
  type Kpis,
  type Playbook,
  type Policy,
  type Scenario,
  type SimEvent,
  defaultPolicy,
  prepareShift,
  simulate,
  simulateDays,
} from "@repo/sim";
import { since } from "@repo/logger";
import { log } from "../logging";

// What the run view replays; per-part start and finish events are left out.
const REPLAYED: SimEvent["type"][] = [
  "created",
  "completed",
  "scrap",
  "status",
  "failure",
  "repair-start",
  "repair-end",
  "preventive-start",
  "preventive-end",
];

/** A finished run, as the results step replays it. */
export interface RunRecord {
  /** Set once the run is kept as the project's latest run. */
  id?: string;
  seed: number;
  horizon: number;
  maintenanceCrews: number;
  tickMinutes: number;
  scenario: Scenario;
  graph: FactoryGraph;
  agents: AgentSpec[];
  adjustments: Adjustment[];
  /** Standard rules on the run's own seed. */
  baseline: Kpis;
  /** Standard rules on each day averaged, from the run's seed on. */
  days: Kpis[];
  kpis: Kpis;
  events: SimEvent[];
  decisions: DecisionRecord[];
  playbook?: Playbook | null;
}

/**
 * What a run is kept as: the project's latest run, or its run with the
 * picked changes that `key` names, which never replaces the latest run.
 */
export type RunPurpose = { kind: "latest" } | { kind: "trial"; key: string };

/** A kept run, which the playbook is added to once written. */
export interface KeptRun {
  /** The id the page names a latest run by; none for a run with changes. */
  id?: string;
  addPlaybook(playbook: Playbook): Promise<void>;
}

/** Where a project's runs are kept. */
export interface RunStore {
  keep(projectId: string, purpose: RunPurpose, run: RunRecord): Promise<KeptRun>;
  latest(projectId: string): Promise<RunRecord | null>;
  trial(projectId: string): Promise<{ key: string; run: RunRecord } | null>;
  forgetTrial(projectId: string): Promise<void>;
}

/** The models the shift needs: agents deciding on the floor, and the playbook writer. */
export interface ShiftModels {
  agents(options: {
    agents: AgentSpec[];
    goal: string;
    onDecision: (record: DecisionRecord) => void;
  }): Policy;
  writePlaybook(input: {
    graph: FactoryGraph;
    goal: string;
    decisions: DecisionRecord[];
  }): Promise<Playbook>;
}

export interface ShiftRequest {
  graph: FactoryGraph;
  scenario: Scenario;
  agents: AgentSpec[];
  seed: number;
  tickMinutes: number;
  /** Days the standard-rules baseline is averaged over. */
  days: number;
  /** The project to keep the run with; nothing is kept without it. */
  projectId?: string;
  purpose: RunPurpose;
}

/** One line of the answer, in the order `streamShift` sends them. */
export type ShiftLine =
  | {
      type: "start";
      horizon: number;
      maintenanceCrews: number;
      adjustments: Adjustment[];
      baseline: Kpis;
      days: Kpis[];
    }
  | { type: "decision"; record: DecisionRecord }
  | { type: "events"; events: SimEvent[] }
  | { type: "done"; kpis: Kpis; events: SimEvent[]; runId?: string }
  | { type: "playbook"; playbook: Playbook | null; problem?: string }
  | { type: "error"; message: string };

// The briefing comes from the page; this much is plenty for a few sentences.
const MAX_BRIEFING = 1000;

/** What the crew is asked to achieve, from the scenario's targets and briefing. */
export function goal({ targets, shiftHours, briefing }: Scenario): string {
  const wanted = [
    targets?.throughputPerShift &&
      `ship at least ${targets.throughputPerShift} parts in the ${shiftHours}-hour shift`,
    targets?.maxAverageWip &&
      `keep work in progress under ${targets.maxAverageWip} parts`,
    targets?.maxDownShare &&
      `keep every station down less than ${Math.round(targets.maxDownShare * 100)}% of the time`,
  ].filter(Boolean);
  const aim =
    wanted.length > 0
      ? `${wanted.join(", ")}.`.replace(/^./, (first) => first.toUpperCase())
      : "Ship as many good parts as possible this shift.";
  const told =
    typeof briefing === "string" ? briefing.trim().slice(0, MAX_BRIEFING) : "";
  return told ? `${aim} Briefing: ${told}` : aim;
}

/**
 * Runs the shift on standard rules over the request's days, then once more
 * on the first seed with the agents deciding, sending each line as it
 * happens: `start`, `events` and `decision` lines while the agents decide,
 * `done`, and with agents a last `playbook`. A failure is sent as `error`.
 * The finished run is kept as its purpose says; a run that cannot be kept
 * is still sent. Once `aborted` answers true, no more decisions are paid for
 * and nothing more is sent.
 */
export async function streamShift(
  request: ShiftRequest,
  deps: { store: RunStore | null; models: ShiftModels },
  send: (line: ShiftLine) => Promise<void> | void,
  aborted: () => boolean,
): Promise<void> {
  const started = performance.now();
  const crewGoal = goal(request.scenario);
  const { graph, config, adjustments } = prepareShift(request);
  const tally = { decisions: 0, fallbacks: 0 };
  log.info("shift started", {
    scenario: request.scenario.name,
    shiftHours: request.scenario.shiftHours,
    stations: request.graph.nodes.length,
    agents: request.agents.map(({ name, role }) => `${name} (${role})`),
    days: request.days,
    seed: request.seed,
    purpose: request.purpose.kind,
    goal: crewGoal,
  });

  try {
    const days = await simulateDays(graph, config, request.days);
    await send({
      type: "start",
      horizon: config.horizon,
      maintenanceCrews: config.maintenanceCrews,
      adjustments,
      baseline: days[0]!,
      days,
    });

    let decide: Policy["decide"] = defaultPolicy.decide;
    const records: DecisionRecord[] = [];
    if (request.agents.length > 0) {
      const agents = deps.models.agents({
        agents: request.agents,
        goal: crewGoal,
        onDecision: (record) => {
          tally.decisions++;
          if (record.fallback) tally.fallbacks++;
          records.push(record);
          void send({ type: "decision", record });
        },
      });
      decide = (decision) => {
        // Nobody is watching any more, so stop paying for decisions.
        if (aborted()) throw new Error("The run was cancelled");
        return agents.decide(decision);
      };
    }
    // The shift only takes real time while it waits on a decision, so the
    // events so far go out just before each one: the page shows the floor as
    // the agents see it.
    let unsent: SimEvent[] = [];
    const policy: Policy = {
      decide(decision) {
        if (unsent.length > 0) {
          void send({ type: "events", events: unsent });
          unsent = [];
        }
        return decide(decision);
      },
    };
    const operated = await simulate(
      graph,
      {
        ...config,
        onEvent: (event) => {
          if (REPLAYED.includes(event.type)) unsent.push(event);
        },
      },
      policy,
    );
    log.info("shift finished", {
      completed: operated.kpis.completed,
      scrapped: operated.kpis.scrapped,
      bottleneck: operated.kpis.bottleneck,
      baselineCompleted: days[0]!.completed,
      ...tally,
      ms: since(started),
    });
    const events = operated.events.filter(({ type }) => REPLAYED.includes(type));
    const record: RunRecord = {
      seed: request.seed,
      horizon: config.horizon,
      maintenanceCrews: config.maintenanceCrews,
      tickMinutes: request.tickMinutes,
      scenario: request.scenario,
      graph: request.graph,
      agents: request.agents,
      adjustments,
      baseline: days[0]!,
      days,
      kpis: operated.kpis,
      events,
      decisions: records,
    };

    // Kept with the project, so the results step can load it again on any
    // device. A run that cannot be kept is still shown.
    let kept: KeptRun | null = null;
    if (request.projectId && deps.store) {
      const saving = performance.now();
      kept = await deps.store
        .keep(request.projectId, request.purpose, record)
        .then(
          (done) => {
            log.info("run kept", {
              purpose: request.purpose.kind,
              run: done.id,
              events: events.length,
              ms: since(saving),
            });
            return done;
          },
          (error: unknown) => {
            log.warn("run not kept", { error, ms: since(saving) });
            return null;
          },
        );
    }
    await send({ type: "done", kpis: operated.kpis, events, runId: kept?.id });

    // The crew's way of working as fixed rules, so the page can replay it over
    // many days. The shift is already shown, so failing here only costs the
    // averages, not the run.
    if (records.length > 0 && !aborted()) {
      const writing = performance.now();
      try {
        const playbook = await deps.models.writePlaybook({
          graph: request.graph,
          goal: crewGoal,
          decisions: records,
        });
        log.info("playbook written", {
          repairOrder: playbook.repairOrder.length,
          release: Object.keys(playbook.release).length,
          service: Object.keys(playbook.serviceEveryHours).length,
          ms: since(writing),
        });
        await kept
          ?.addPlaybook(playbook)
          .catch((error: unknown) => log.warn("playbook not kept", { error }));
        await send({ type: "playbook", playbook });
      } catch (error) {
        if (aborted()) return;
        log.warn("playbook failed", { error, ms: since(writing) });
        await send({
          type: "playbook",
          playbook: null,
          problem: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    if (aborted()) return;
    log.error("shift failed", { error, ...tally, ms: since(started) });
    await send({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
