import type { FactoryGraph, Scenario, SimEvent } from "@repo/sim";
import type { RunLine } from "./api";
import type { AgentSpec, DecisionRecord, StoredRun } from "./project";

/** A shift for the API to run. */
export interface RunRequest {
  graph: FactoryGraph;
  scenario: Scenario;
  agents: AgentSpec[];
  seed: number;
  tickMinutes: number;
  /** Days the standard-rules baseline is averaged over. */
  days: number;
  /** The project the run is kept with; nothing is kept without it. */
  projectId?: string;
  /**
   * Set for a run with the picked changes: kept as the project's run with
   * changes for the picks `key` names, never as its latest run.
   */
  trial?: { key: string };
}

/** The shift so far, while it runs. */
export interface RunProgress {
  horizon: number;
  decisions: DecisionRecord[];
  events: SimEvent[];
}

export interface RunHandlers {
  onProgress?: (progress: RunProgress) => void;
  /** The shift is over; its replay can start while the playbook is written. */
  onFinished?: (run: StoredRun) => void;
  /** With agents, after the shift: the run with their playbook, or why not. */
  onPlaybook?: (run: StoredRun, problem: string) => void;
}

/** Where the run's lines come from: the API in the app, a script in tests. */
export type RunLineSource = (
  request: RunRequest,
  onLine: (line: RunLine) => void,
  signal: AbortSignal,
) => Promise<void>;

/**
 * Runs a shift and answers the finished run, with its playbook once written.
 * Rejects on an error line, on a shift that ends before it finished, and
 * when `signal` aborts.
 */
export async function runShift(
  request: RunRequest,
  source: RunLineSource,
  handlers: RunHandlers,
  signal: AbortSignal,
): Promise<StoredRun> {
  const progress: RunProgress = {
    horizon: request.scenario.shiftHours * 3600,
    decisions: [],
    events: [],
  };
  let started: Extract<RunLine, { type: "start" }> | null = null;
  let finished: StoredRun | null = null;

  await source(
    request,
    (line) => {
      switch (line.type) {
        case "start":
          started = line;
          progress.horizon = line.horizon;
          break;
        case "decision":
          progress.decisions = [...progress.decisions, line.record];
          break;
        case "events":
          progress.events = [...progress.events, ...line.events];
          break;
        case "error":
          throw new Error(line.message);
        case "done": {
          if (!started) throw new Error("The shift finished before it started");
          const { type: _, ...opening } = started;
          finished = {
            ...opening,
            ...(line.runId ? { id: line.runId } : {}),
            seed: request.seed,
            tickMinutes: request.tickMinutes,
            scenario: request.scenario,
            graph: request.graph,
            agents: request.agents,
            kpis: line.kpis,
            events: line.events,
            decisions: progress.decisions,
          };
          handlers.onFinished?.(finished);
          return;
        }
        case "playbook":
          if (!finished) return;
          finished = { ...finished, playbook: line.playbook };
          handlers.onPlaybook?.(finished, line.problem ?? "");
          return;
      }
      handlers.onProgress?.({ ...progress });
    },
    signal,
  );
  if (!finished) throw new Error("The shift ended before it finished");
  return finished;
}
