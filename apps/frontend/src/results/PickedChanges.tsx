import type { Kpis } from "@repo/sim";
import { usePlantUnit } from "@/scenario/plant";
import { ui } from "@/lib/ui";
import { cn } from "@/lib/utils";
import type { StoredRun } from "@/twin/project";
import { signedAverage } from "./format";

/** The picked changes: how many, and their gain together and one by one. */
export interface Picks {
  count: number;
  together: number | null;
  separately: number | null;
}

/** The picked changes run with the crew on a copy of the twin. */
export interface TrialView {
  /** Its outcome, while the picks are still those it ran with. */
  after: { run: StoredRun; rules: Kpis[]; agents: Kpis[] | null } | null;
  running: boolean;
  /** Agent decisions so far, while it runs. */
  decisions: number;
  /** It ran, but the picks have changed since. */
  outdated: boolean;
  /** Why it cannot run now, if it cannot. */
  blocked: string;
  problem: string;
  /** Its crew's playbook is being written, after the shift. */
  writingPlaybook: boolean;
  /** Why its crew's playbook could not be written, if it could not. */
  playbookProblem: string;
}

/**
 * What the picked changes do together against one by one, and how their run
 * stands. They run from the run button over the world.
 * Shown in the side pane, and over the world when the redesign is in view.
 */
export function PickedChanges({
  picks,
  trial,
  hasAgents,
  over = false,
}: {
  picks: Picks;
  trial: TrialView;
  hasAgents: boolean;
  /** Drawn over the world, on its dark glass. */
  over?: boolean;
}) {
  const unit = usePlantUnit();
  const { count, together, separately } = picks;
  const quiet = over ? "text-white/70" : "text-muted-foreground";
  return (
    <section
      aria-label="Picked changes"
      className={cn(
        "flex flex-col gap-2 rounded-2xl border p-3",
        over
          ? "border-white/15 bg-[#14140f]/85 text-white backdrop-blur-md"
          : "border-ink bg-primary/10",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <strong className="text-sm">
          {count} picked {count === 1 ? "change" : "changes"}
        </strong>
        <span
          className={cn(
            "font-mono text-xs font-semibold",
            over && "text-primary",
          )}
        >
          {together === null
            ? "measuring…"
            : `together ${signedAverage(together)} ${unit}/shift`}
        </span>
      </div>
      {count > 1 && together !== null && separately !== null && (
        <p className={cn("text-xs", quiet)}>
          One by one they add up to {signedAverage(separately)}.{" "}
          {Math.abs(together - separately) < 0.5
            ? "Together they add up the same."
            : together > separately
              ? `Together they do ${signedAverage(together - separately)} better: they help each other.`
              : `Together they do ${signedAverage(separately - together).replace("+", "")} less: they fix the same problem.`}
        </p>
      )}
      {!over && (
        <p className={cn("text-xs", quiet)}>
          Measured on standard rules. Press Run with changes at the top to
          see standard rules and your agents with them, on a copy of your
          twin. They can be applied once that run is done; your twin changes
          only when you apply them.
        </p>
      )}
      {trial.problem && (
        <p className={cn(over ? "text-[#ff8c42]" : ui.poor, "text-xs")}>
          The run with your changes failed: {trial.problem}
        </p>
      )}
      {trial.blocked ? (
        <p className={cn("text-xs", quiet)}>{trial.blocked}</p>
      ) : (
        trial.running && (
          <p className={cn("text-xs", quiet)}>
            Running with these changes…
            {hasAgents &&
              ` ${trial.decisions} agent ${trial.decisions === 1 ? "decision" : "decisions"} so far.`}
          </p>
        )
      )}
      {trial.after && (
        <p className={cn("text-xs", quiet)}>
          {over
            ? "The results on the right show your plant with these changes."
            : "The table above now shows your plant with these changes."}
        </p>
      )}
      {trial.outdated && !trial.running && (
        <p className={cn("text-xs", quiet)}>
          Your picks changed since the last run with changes.
        </p>
      )}
    </section>
  );
}
