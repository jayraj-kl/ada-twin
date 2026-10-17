import type { FactoryNode, Kpis } from "@repo/sim";
import {
  CheckIcon,
  HistoryIcon,
  PlusIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import { ui } from "@/lib/ui";
import { cn } from "@/lib/utils";
import type { CostEstimate } from "@/twin/api";
import { type StoredRun, percent } from "@/twin/project";
import type { Change, MeasuredChange } from "@/twin/recommend";
import {
  CURRENCIES,
  costKey,
  headline,
  money,
  moneyRange,
  perPart,
  signed,
} from "./format";

/** One saved state of the redesign. */
export interface RedesignVersion {
  at: number;
  label: string;
  changes: Change[];
}

const sectionTitle =
  "mb-2 flex items-baseline justify-between gap-2 text-sm font-semibold";

function Delta({
  value,
  base,
  digits = 0,
  lowerIsBetter = false,
}: {
  value: number;
  base: number;
  digits?: number;
  lowerIsBetter?: boolean;
}) {
  const change = value - base;
  if (Math.abs(change) < 10 ** -digits / 2) return null;
  const good = lowerIsBetter ? change < 0 : change > 0;
  return (
    <span
      className={cn("block text-[11px] leading-none", good ? ui.good : ui.poor)}
    >
      {signed(change, digits)}
    </span>
  );
}

/** The measured outcome: standard rules, the agents, and the redesign. */
export function ResultsTab({
  run,
  redesign,
  measuring,
  showRedesign,
  suggestions,
  problem,
  onAdd,
}: {
  run: StoredRun;
  /** The redesign on standard rules; null when it has no changes. */
  redesign: Kpis | null;
  measuring: boolean;
  /** Whether the station breakdown shows the redesign rather than the run. */
  showRedesign: boolean;
  suggestions: (MeasuredChange & { added: boolean })[] | null;
  problem: string;
  onAdd: (change: MeasuredChange) => void;
}) {
  const names = new Map(run.graph.nodes.map(({ id, name }) => [id, name]));
  const { kpis, baseline } = run;
  const target = run.scenario.targets?.throughputPerShift;
  const hasAgents = run.agents.length > 0;
  const columns = [
    { key: "rules", label: "Standard rules", kpis: baseline },
    ...(hasAgents ? [{ key: "agents", label: "Your agents", kpis }] : []),
    { key: "redesign", label: "Redesign", kpis: redesign },
  ];
  const rows: {
    label: string;
    value: (kpis: Kpis) => number;
    show: (value: number) => string;
    digits?: number;
    lowerIsBetter?: boolean;
  }[] = [
    { label: "Parts shipped", value: (k) => k.completed, show: String },
    {
      label: "Average work in progress",
      value: (k) => k.averageWip,
      show: (v) => v.toFixed(1),
      digits: 1,
      lowerIsBetter: true,
    },
    {
      label: "Parts scrapped",
      value: (k) => k.scrapped,
      show: String,
      lowerIsBetter: true,
    },
    ...(target
      ? [
          {
            label: `Of the ${target} target`,
            value: (k: Kpis) => Math.round((k.completed / target) * 100),
            show: (v: number) => `${v}%`,
          },
        ]
      : []),
  ];

  const shown = showRedesign && redesign ? redesign : kpis;
  const stations = run.graph.nodes.filter(
    (node): node is Extract<FactoryNode, { kind: "station" }> =>
      node.kind === "station",
  );
  const supports = run.graph.nodes.filter(({ kind }) => kind === "support");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg leading-snug font-semibold text-balance">
          {headline(run)}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Same shift, same random events: on standard rules
          {hasAgents ? ", with your agents," : ""} and with your redesign.
          Changes are measured on standard rules, so they compare fairly.
        </p>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-muted-foreground">
            <th className="pb-1.5 text-left font-medium" />
            {columns.map((column) => (
              <th
                key={column.key}
                className="pb-1.5 pl-3 text-right font-medium"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="py-2 pr-2 align-top text-muted-foreground">
                {row.label}
              </td>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className="py-2 pl-3 text-right align-top font-mono whitespace-nowrap tabular-nums"
                >
                  {column.kpis ? (
                    <>
                      <span className="block">
                        {row.show(row.value(column.kpis))}
                      </span>
                      {column.key !== "rules" && (
                        <Delta
                          value={row.value(column.kpis)}
                          base={row.value(baseline)}
                          digits={row.digits}
                          lowerIsBetter={row.lowerIsBetter}
                        />
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      {measuring ? "…" : "–"}
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td className="py-2 pr-2 text-muted-foreground">Bottleneck</td>
            {columns.map((column) => (
              <td key={column.key} className="py-2 pl-3 text-right text-xs">
                {column.kpis
                  ? (names.get(column.kpis.bottleneck ?? "") ?? "None")
                  : "–"}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      {problem && <p className={cn(ui.poor, "text-sm")}>{problem}</p>}

      <section>
        <h3 className={sectionTitle}>
          Suggested changes
          <span className="text-[11px] font-normal text-muted-foreground">
            each re-simulated on its own
          </span>
        </h3>
        {!suggestions ? (
          <p className={ui.hint}>Re-simulating each change…</p>
        ) : suggestions.length === 0 ? (
          <p className={ui.hint}>Nothing stands out to change.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {suggestions.map((change) => (
              <li
                key={change.id}
                className="flex items-start gap-3 rounded-2xl border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <strong className="text-[13px] leading-snug">
                      {change.title}
                    </strong>
                    <span
                      className={cn(
                        "shrink-0 font-mono text-xs font-semibold",
                        change.gain > 0
                          ? "text-success"
                          : "text-muted-foreground",
                      )}
                    >
                      {signed(change.gain)}/shift
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {change.detail}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={change.added}
                  onClick={() => onAdd(change)}
                  aria-label={
                    change.added
                      ? `${change.title} is in the redesign`
                      : `Add ${change.title} to the redesign`
                  }
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                    change.added
                      ? "border-ink bg-primary text-[#14140f]"
                      : "border-border hover:border-ink hover:bg-accent",
                  )}
                >
                  {change.added ? (
                    <CheckIcon className="size-4" />
                  ) : (
                    <PlusIcon className="size-4" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className={sectionTitle}>
          Where each station&apos;s time went
          <span className="text-[11px] font-normal text-muted-foreground">
            {showRedesign && redesign
              ? "redesign, standard rules"
              : hasAgents
                ? "with your agents"
                : "standard rules"}
          </span>
        </h3>
        <ul className="flex flex-col gap-2.5">
          {stations.map((station) => {
            const time = shown.stations[station.id];
            if (!time) return null;
            const stopped = time.stopped ?? 0;
            const by = Object.entries(time.stoppedBy ?? {})
              .filter(([, share]) => share > 0)
              .map(([id, share]) => `${names.get(id) ?? id} ${percent(share)}`);
            return (
              <li key={station.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate font-medium">{station.name}</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    busy {percent(time.utilisation)} · blocked{" "}
                    {percent(time.blocked)} · down {percent(time.down)}
                    {stopped > 0 && ` · stopped ${percent(stopped)}`}
                  </span>
                </div>
                <div
                  className={ui.bar}
                  title={
                    by.length > 0 ? `Stopped by ${by.join(", ")}` : undefined
                  }
                >
                  <div
                    className={ui.running}
                    style={{ width: percent(time.utilisation) }}
                  />
                  <div
                    className={ui.blocked}
                    style={{ width: percent(time.blocked) }}
                  />
                  <div
                    className={ui.down}
                    style={{ width: percent(time.down) }}
                  />
                  <div
                    className={ui.stopped}
                    style={{ width: percent(stopped) }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            <span className={cn(ui.dot, ui.running)} /> busy
          </span>
          <span>
            <span className={cn(ui.dot, ui.blocked)} /> blocked
          </span>
          <span>
            <span className={cn(ui.dot, ui.down)} /> down
          </span>
          <span>
            <span className={cn(ui.dot, ui.stopped)} /> stopped by auxiliary
          </span>
        </p>
      </section>

      {supports.length > 0 && (
        <section>
          <h3 className={sectionTitle}>
            Auxiliary equipment
            <span className="text-[11px] font-normal text-muted-foreground">
              share of the shift down
            </span>
          </h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[11px] text-muted-foreground">
                <th className="pb-1 text-left font-medium" />
                {columns.map((column) => (
                  <th key={column.key} className="pb-1 text-right font-medium">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {supports.map((support) => (
                <tr key={support.id}>
                  <td className="py-1.5 pr-2">
                    {support.name}
                    <div className="text-[11px] text-muted-foreground">
                      needed by{" "}
                      {(run.graph.dependencies ?? [])
                        .filter(({ support: id }) => id === support.id)
                        .map(({ neededBy }) => names.get(neededBy) ?? neededBy)
                        .join(", ") || "nothing"}
                    </div>
                  </td>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className="py-1.5 text-right font-mono tabular-nums"
                    >
                      {column.kpis
                        ? percent(column.kpis.supports?.[support.id]?.down ?? 0)
                        : "–"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="text-[11px] text-muted-foreground">
        {run.scenario.name}: {run.scenario.shiftHours}-hour shift, seed{" "}
        {run.seed}, {run.maintenanceCrews} maintenance{" "}
        {run.maintenanceCrews === 1 ? "crew" : "crews"}, {run.decisions.length}{" "}
        agent decisions, {run.adjustments.length} adjustments to the twin.
      </p>
    </div>
  );
}

/** What the redesign changes, what each change costs, and its versions. */
export function ChangesTab({
  changes,
  alone,
  together,
  costs,
  currency,
  pricing,
  costProblem,
  history,
  onCurrency,
  onReprice,
  onDrop,
  onRestore,
}: {
  changes: Change[];
  /** Parts per shift each change gains on its own. */
  alone: Record<string, number | "failed">;
  /** Parts per shift all of them gain together, once measured. */
  together: number | null;
  costs: Record<string, CostEstimate>;
  currency: string;
  pricing: boolean;
  costProblem: string;
  history: RedesignVersion[];
  onCurrency: (currency: string) => void;
  onReprice: () => void;
  onDrop: (id: string) => void;
  onRestore: (index: number) => void;
}) {
  const sum = changes.reduce(
    (total, { id }) =>
      total + (typeof alone[id] === "number" ? (alone[id] as number) : 0),
    0,
  );
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-lg font-semibold">
          {changes.length === 0
            ? "No changes yet"
            : `${changes.length} ${changes.length === 1 ? "change" : "changes"} in the redesign`}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {changes.length === 0
            ? "Add a suggested change, or tell the assistant below what you would change. Your twin is not touched until you apply the redesign."
            : together === null
              ? "Measuring them together…"
              : `Together ${signed(together)} parts per shift on standard rules; one by one they add up to ${signed(sum)}.`}
        </p>
      </section>

      {changes.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">
              {pricing ? "Looking up costs on the web…" : "Costs from the web"}
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <label htmlFor="currency" className="sr-only">
                Currency
              </label>
              <select
                id="currency"
                className={cn(ui.input, "h-8 py-0 text-xs")}
                value={currency}
                disabled={pricing}
                onChange={(event) => onCurrency(event.target.value)}
              >
                {CURRENCIES.map((code) => (
                  <option key={code}>{code}</option>
                ))}
              </select>
              <button
                className={ui.button}
                disabled={pricing}
                onClick={onReprice}
              >
                Look up again
              </button>
            </span>
          </div>
          {costProblem && (
            <p className={cn(ui.poor, "text-xs")}>
              Costs could not be looked up: {costProblem}
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {changes.map((change) => {
              const gain = alone[change.id];
              const cost = costs[costKey(currency, change)];
              const each =
                cost && typeof gain === "number" ? perPart(cost, gain) : null;
              return (
                <li
                  key={change.id}
                  className="rounded-2xl border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span
                        className={cn(
                          "mb-1 inline-block rounded-full px-2 py-px text-[10px] font-semibold tracking-wide uppercase",
                          change.origin === "asked"
                            ? "bg-primary text-[#14140f]"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {change.origin === "asked" ? "You asked" : "Suggested"}
                      </span>
                      <strong className="block text-[13px] leading-snug">
                        {change.title}
                      </strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDrop(change.id)}
                      aria-label={`Drop ${change.title}`}
                      className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
                    >
                      <XIcon className="size-4" />
                    </button>
                  </div>
                  {change.detail && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {change.detail}
                    </p>
                  )}
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-[11px] text-muted-foreground">
                        Alone
                      </dt>
                      <dd
                        className={cn(
                          "font-mono font-semibold",
                          gain === "failed"
                            ? "text-destructive"
                            : typeof gain === "number" && gain > 0
                              ? "text-success"
                              : undefined,
                        )}
                      >
                        {gain === undefined
                          ? "…"
                          : gain === "failed"
                            ? "only with the others"
                            : `${signed(gain)} parts/shift`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-muted-foreground">
                        Cost
                      </dt>
                      <dd className="font-mono">
                        {!cost ? (
                          <span className="text-muted-foreground">
                            {pricing ? "…" : "–"}
                          </span>
                        ) : (
                          <>
                            {cost.oneOff
                              ? moneyRange(cost.oneOff, cost.currency)
                              : "No upfront cost"}
                            {cost.yearly && (
                              <div className="text-[11px] text-muted-foreground">
                                + {moneyRange(cost.yearly, cost.currency)} a
                                year
                              </div>
                            )}
                            {each !== null && (
                              <div className="text-[11px] text-muted-foreground">
                                ≈ {money(each, cost.currency)} per extra part
                              </div>
                            )}
                          </>
                        )}
                      </dd>
                    </div>
                  </dl>
                  {cost && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {cost.basis}{" "}
                      {cost.sources.length > 0 ? (
                        cost.sources.map((source, index) => (
                          <a
                            key={source.url}
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            title={source.title ?? source.url}
                            className="mr-1.5 underline"
                          >
                            [{index + 1}]
                          </a>
                        ))
                      ) : (
                        <span className={ui.fair}>
                          No source found: the model&apos;s own estimate.
                        </span>
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {history.length > 1 && (
        <section>
          <h3 className={sectionTitle}>
            <span className="flex items-center gap-1.5">
              <HistoryIcon className="size-3.5" /> Versions
            </span>
          </h3>
          <ol className="flex flex-col-reverse gap-1">
            {history.map((version, index) => (
              <li
                key={version.at}
                className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs hover:bg-accent"
              >
                <span className="w-7 shrink-0 font-mono text-muted-foreground">
                  v{index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{version.label}</span>
                <span className="shrink-0 text-muted-foreground">
                  {version.changes.length}
                </span>
                {index === history.length - 1 ? (
                  <span className="w-[68px] shrink-0 text-right text-[11px] text-muted-foreground">
                    current
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onRestore(index)}
                    className="flex w-[68px] shrink-0 items-center justify-end gap-1 rounded-full text-[11px] font-semibold outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40"
                  >
                    <RotateCcwIcon className="size-3" /> Restore
                  </button>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="rounded-2xl border border-dashed border-border p-3 text-[11px] text-muted-foreground">
        The 3D view marks the changed machines on your current world. Drawing
        new equipment into the photo and generating a fresh world from it is not
        built yet.
      </p>
    </div>
  );
}
