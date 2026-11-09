// What the results step shows: the latest run, which is the run with the
// picked changes once it is current. Kept free of the page's imports so the
// root tests can check it.
import type { Kpis } from "@repo/sim";

/** The run with the picked changes, while the picks are still those it ran with. */
export interface After<Run> {
  run: Run;
  /** Standard rules on each day of it. */
  rules: Kpis[];
  /** Its crew's playbook replayed on each day, once written. */
  agents: Kpis[] | null;
}

/** The run the results show, with the days each column averages. */
export interface Latest<Run> {
  run: Run;
  /** Standard rules on each day of it. */
  rules: Kpis[];
  /** Its crew's playbook replayed on each day; null until written. */
  crewDays: Kpis[] | null;
  /** Whether it is the run with the picked changes. */
  withPicks: boolean;
}

/** The run with the picks once it is current, else the run itself. */
export function latestOf<Run extends { kpis: Kpis }>(
  run: Run,
  rules: Kpis[],
  crewDays: Kpis[] | null,
  after: After<Run> | null,
): Latest<Run> {
  return after
    ? { run: after.run, rules: after.rules, crewDays: after.agents, withPicks: true }
    : { run, rules, crewDays, withPicks: false };
}

const mean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * What the latest run shipped on average, on standard rules and by its crew
 * (null without agents). Until the playbook replays the crew on every day,
 * their one real day stands in, as it does in the table.
 */
export function shippedOf<Run extends { kpis: Kpis }>(
  latest: Latest<Run>,
  hasAgents: boolean,
) {
  return {
    rules: mean(latest.rules.map((day) => day.completed)),
    crew: hasAgents
      ? mean((latest.crewDays ?? [latest.run.kpis]).map((day) => day.completed))
      : null,
  };
}

/** A count averaged over days, to one decimal, without a trailing ".0". */
const count = (value: number) => {
  const rounded = Math.round(value * 10) / 10;
  return rounded.toFixed(Number.isInteger(rounded) ? 0 : 1);
};

/**
 * The results' one-line verdict, from the same averages the table shows:
 * what standard rules and the crew (null with no agents) shipped, with the
 * picked changes when there are any.
 */
export function headline({
  rules,
  crew,
  target,
  picked,
  unit,
}: {
  rules: number;
  crew: number | null;
  target?: number;
  picked: number;
  unit: string;
}): string {
  const gained = crew === null ? 0 : Math.round((crew - rules) * 10) / 10;
  const said =
    crew === null
      ? "no agents ran this shift"
      : gained > 0
        ? `the crew shipped ${count(gained)} more ${unit} than standard rules`
        : gained < 0
          ? `the crew shipped ${count(-gained)} fewer ${unit} than standard rules`
          : "the crew matched standard rules";
  const lead =
    picked > 0
      ? `With your picked ${picked === 1 ? "change" : "changes"}, ${said}`
      : `${said[0]!.toUpperCase()}${said.slice(1)}`;
  if (!target) return lead;
  const shipped = crew ?? rules;
  return shipped >= target
    ? `${lead}, and the target of ${target} was met`
    : `${lead}, but the plant is ${count(target - shipped)} short of ${target}`;
}

/** What each change adds on top of the picked ones, once measured. */
export type OnTop = Record<string, number | "failed">;

/**
 * What a suggestion gains as the results show it: on top of the picked
 * changes once their run is current, else on the plant as it is. Undefined
 * while it is still being measured.
 */
export function shownGain(
  change: { id: string; gain: number },
  onTop: OnTop,
  withPicks: boolean,
): number | "failed" | undefined {
  return withPicks ? onTop[change.id] : change.gain;
}

/**
 * Suggestions in the order the results list them: by the gain they show,
 * those still measuring or that failed last.
 */
export function byShownGain<Change extends { id: string; gain: number }>(
  changes: readonly Change[],
  onTop: OnTop,
  withPicks: boolean,
): Change[] {
  const rank = (change: Change) => {
    const gain = shownGain(change, onTop, withPicks);
    return typeof gain === "number" ? gain : -Infinity;
  };
  return [...changes].sort((a, b) => rank(b) - rank(a));
}
