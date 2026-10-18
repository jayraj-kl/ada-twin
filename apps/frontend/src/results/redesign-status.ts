import type { FactoryGraph, Kpis, Scenario } from "@repo/sim";
import type { AgentSpec, StoredRun } from "@/twin/project";
import type { Change } from "@/twin/recommend";

/** JSON with object keys sorted, so a value saved and read back keys the same. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : item,
  );
}

/**
 * The run's identity: the server's id once it is kept, otherwise what it
 * holds, for runs kept before ids reached the page.
 */
export const runId = (run: StoredRun) =>
  run.id ??
  `${run.seed}:${run.events.length}:${run.kpis.completed}:${run.decisions.length}`;

type Picks = Pick<Change, "diffs" | "extraCrews">[];

/** Which picks on which run a run with changes was made for. */
export const trialKeyOf = (run: StoredRun, picks: Picks) =>
  stableJson([runId(run), picks.map(({ diffs, extraCrews }) => [diffs, extraCrews])]);

/** The picked changes, run with the crew on a copy of the twin. */
export interface Trial {
  /** The picks and run it was made for, as `trialKeyOf` names them. */
  key: string;
  run: StoredRun;
  /** Its crew's playbook replayed on each day, once written. */
  crewDays: Kpis[] | null;
}

/** What the run would be made on now. */
export interface ShiftNow {
  graph: FactoryGraph;
  scenario: Scenario;
  seed: number;
  /** Days the standard rules are averaged over. */
  days: number;
  agents: AgentSpec[];
  tickMinutes: number;
}

export type ChangedSince = "twin" | "seed" | "days" | "crew";

/** What the one run button does, when it is offered. */
export interface RunOffer {
  does: "shift" | "picks";
  label: string;
  /** Why it is offered, for its tooltip. */
  why?: string;
}

export interface RedesignStatus {
  /** The twin or scenario changed since the run, e.g. by applying a redesign. */
  stale: boolean;
  /** What the run would be made on now differs in, from the run shown. */
  changed: ChangedSince[];
  trialKey: string;
  /** The kept run with changes was made for exactly these picks on this run. */
  trialCurrent: boolean;
  /** A run with changes exists, for other picks. */
  outdated: boolean;
  /** The picks can be applied: their run with changes is current and the run is not stale. */
  tested: boolean;
  /** Why the picks cannot be run now, if they cannot. */
  blocked: string;
  /** What the run with changes shipped less than the plant as it is, if it did. */
  worse: string;
  /** The run button, or null when running would show nothing new. */
  offer: RunOffer | null;
}

/**
 * Where the redesign stands against the run shown, and what running does.
 * Picks count as tested once a run with exactly them has finished on the
 * twin as it is; only then can they be applied. The run button is offered
 * only when running would show something new: untested picks first, so
 * picking a change lights it up; then a shift that would differ from the
 * run shown. Picks are tried on the run's twin, so once the twin has changed
 * the shift itself is run again first.
 */
export function redesignStatus(input: {
  run: StoredRun | null;
  now: ShiftNow;
  /** False until the twin has loaded, so a half-loaded twin is not "changed". */
  twinLoaded: boolean;
  picks: Picks;
  trial: Trial | null;
  /** A shift or a run with changes is streaming; with its decisions so far. */
  running: { decisions: number; trial: boolean } | null;
  /** What the plant makes, plural. */
  unit: string;
}): RedesignStatus {
  const { run, now, twinLoaded, picks, trial, running, unit } = input;
  const stale =
    run !== null &&
    twinLoaded &&
    (stableJson(run.graph) !== stableJson(now.graph) ||
      stableJson(run.scenario) !== stableJson(now.scenario));
  const changed: ChangedSince[] = run
    ? [
        stale && ("twin" as const),
        now.seed !== run.seed && ("seed" as const),
        now.days !== (run.days ?? [run.baseline]).length && ("days" as const),
        (now.tickMinutes !== run.tickMinutes ||
          stableJson(now.agents) !== stableJson(run.agents)) &&
          ("crew" as const),
      ].filter((reason): reason is ChangedSince => Boolean(reason))
    : [];
  const trialKey = run ? trialKeyOf(run, picks) : "";
  const trialCurrent = picks.length > 0 && trial !== null && trial.key === trialKey;
  const outdated = picks.length > 0 && trial !== null && !trialCurrent;
  const tested = trialCurrent && !stale;
  const runsPicks = run !== null && !stale && picks.length > 0 && !tested;

  return {
    stale,
    changed,
    trialKey,
    trialCurrent,
    outdated,
    tested,
    blocked: stale
      ? "Your twin has changed since this run: run the shift again first."
      : "",
    worse: run && trialCurrent ? worseThan(run, trial!.run, unit) : "",
    offer: running
      ? {
          does: running.trial ? "picks" : "shift",
          label:
            running.trial && run?.agents.length
              ? `Running… ${running.decisions} ${running.decisions === 1 ? "decision" : "decisions"}`
              : "Running…",
        }
      : !run
        ? { does: "shift", label: "Run the shift" }
        : runsPicks
          ? {
              does: "picks",
              label: outdated ? "Run with the new picks" : "Run with changes",
              why: "Run the shift with the picked changes, on a copy of your twin",
            }
          : changed.length > 0
            ? {
                does: "shift",
                label: `Run again · ${changed[0]} changed`,
                why: `Changed since this run: ${changed.join(", ")}.${
                  stale && picks.length > 0
                    ? " Run it again, then run with your changes."
                    : ""
                }`,
              }
            : null,
  };
}

/** What `trial` shipped less than `run`, on standard rules or with the agents. */
function worseThan(run: StoredRun, trial: StoredRun, unit: string): string {
  const mean = (days: Kpis[]) =>
    days.reduce((sum, { completed }) => sum + completed, 0) / days.length;
  const daysOf = (of: StoredRun) => of.days ?? [of.baseline];
  const lost = (by: number, how: string) =>
    by >= 0.5 ? `${Math.round(by * 10) / 10} fewer ${unit} a shift ${how}` : "";
  const losses = [
    lost(mean(daysOf(run)) - mean(daysOf(trial)), "on standard rules"),
    ...(run.agents.length > 0
      ? [lost(run.kpis.completed - trial.kpis.completed, "with your agents")]
      : []),
  ].filter(Boolean);
  return losses.length > 0
    ? `In the run these changes shipped ${losses.join(" and ")}`
    : "";
}
