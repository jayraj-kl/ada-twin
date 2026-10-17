import type { CrewJob, DecisionRequest, Policy, TickAction } from "./kernel";

/**
 * A crew's way of running the floor, written down as fixed rules so it can be
 * replayed on any number of days without asking anyone. Whatever it leaves
 * out falls back to the standard rules.
 */
export interface Playbook {
  /** Machines whose repairs go first, most urgent first. */
  repairOrder: string[];
  /**
   * Per source: slow release (x0.8) while work in progress is above
   * `slowAboveWip`, speed it up (x1.2) while below `fastBelowWip`, and
   * nominal otherwise. A threshold left out is a pace the crew never used.
   */
  release: Record<string, { slowAboveWip?: number; fastBelowWip?: number }>;
  /** Per machine: service it once it has worked this many hours. */
  serviceEveryHours: Record<string, number>;
  /** How the crew ran the floor, in a few sentences. */
  notes?: string;
}

export const EMPTY_PLAYBOOK: Playbook = {
  repairOrder: [],
  release: {},
  serviceEveryHours: {},
};

const SLOW = 0.8;
const FAST = 1.2;

function assignCrew(playbook: Playbook, jobs: CrewJob[]): number {
  const rank = (job: CrewJob) => {
    const index = playbook.repairOrder.indexOf(job.station);
    return index === -1 ? Infinity : index;
  };
  // The listed order first, then whoever has waited longest, as the
  // standard rules would.
  let best = 0;
  jobs.forEach((job, index) => {
    const chosen = jobs[best]!;
    if (
      rank(job) < rank(chosen) ||
      (rank(job) === rank(chosen) && job.waitingSince < chosen.waitingSince)
    ) {
      best = index;
    }
  });
  return best;
}

function planRelease(
  playbook: Playbook,
  options: TickAction[],
  wip: number,
  current: Map<string, number>,
): number {
  for (const [source, rule] of Object.entries(playbook.release)) {
    const wanted =
      rule.slowAboveWip !== undefined && wip > rule.slowAboveWip
        ? SLOW
        : rule.fastBelowWip !== undefined && wip < rule.fastBelowWip
          ? FAST
          : 1;
    if (current.get(source) === wanted) continue;
    const index = options.findIndex(
      (option) =>
        option.type === "set-release" &&
        option.source === source &&
        option.factor === wanted,
    );
    if (index !== -1) return index;
  }
  return 0;
}

function service(
  playbook: Playbook,
  request: Extract<DecisionRequest, { kind: "shift-tick" }>,
): number {
  if (request.snapshot.freeCrews === 0) return 0;
  const { stations, supports = [] } = request.snapshot;
  const worn = new Map(
    [...stations, ...supports].map(({ id, wearHours }) => [id, wearHours]),
  );
  // The machine furthest past its interval, if any is past it.
  let best = 0;
  let mostOverdue = 0;
  request.options.forEach((option, index) => {
    if (option.type !== "preventive") return;
    const every = playbook.serviceEveryHours[option.station];
    if (!every) return;
    const overdue = (worn.get(option.station) ?? 0) / every;
    if (overdue >= 1 && overdue > mostOverdue) {
      mostOverdue = overdue;
      best = index;
    }
  });
  return best;
}

/** Runs the floor by `playbook`; an empty playbook is the standard rules. */
export function playbookPolicy(playbook: Playbook): Policy {
  return {
    decide(request) {
      if (request.kind === "assign-crew") {
        return { choice: assignCrew(playbook, request.options) };
      }
      if (request.kind === "plan-release") {
        const current = new Map(
          request.snapshot.sources.map(({ id, releaseFactor }) => [
            id,
            releaseFactor,
          ]),
        );
        return {
          choice: planRelease(
            playbook,
            request.options,
            request.snapshot.wip,
            current,
          ),
        };
      }
      return { choice: service(playbook, request) };
    },
  };
}
