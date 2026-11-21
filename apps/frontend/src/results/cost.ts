import {
  COST_RATES,
  type CostRateKey,
  type CostRates,
  type Currency,
  type FactoryGraph,
  type Kpis,
  type NumberSource,
  type Playbook,
  type Policy,
  type Scenario,
  SHIFTS_PER_YEAR,
  USD_INR,
  agentsVsRules,
  averageKpis,
  givenNumbers,
  inCurrency,
  machineMoney,
  playbookPolicy,
  shiftMoney,
  simulateShiftDays,
} from "@repo/sim";

import { t } from "../lib/i18n";
/** What the cost measurements read of a stored run. */
export interface CostedRun {
  graph: FactoryGraph;
  scenario: Scenario;
  seed: number;
  tickMinutes: number;
  playbook?: Playbook | null;
}

// The cost of a shift, from four rates in rupees: what a part not shipped is
// worth, a scrapped part, an hour of a technician, the spares of a repair.
// A demo world's rates come from the cost sheet in its pack, each citing its
// passage; anyone else's are typed in.

/** The plant's cost rates, kept with the project. */
export const COST_RATES_KEY = "twin-cost-rates";

export type RateSource =
  | { kind: "doc"; document: string; page?: number; quote: string }
  | { kind: "user" };

export interface StoredRate {
  /** In rupees. */
  value: number;
  source: RateSource;
}

export type StoredRates = Partial<Record<CostRateKey, StoredRate>>;

/** The rates as numbers once every one is set; null while any is missing. */
export function ratesOf(stored: StoredRates | undefined): CostRates | null {
  const values = COST_RATES.map(({ key }) => stored?.[key]?.value);
  if (values.some((value) => value === undefined || !Number.isFinite(value))) {
    return null;
  }
  return Object.fromEntries(
    COST_RATES.map(({ key }, index) => [key, values[index]!]),
  ) as CostRates;
}

/**
 * An amount as shown: whole rupees or dollars, grouped in thousands. A rate
 * can keep its cents, where a dollar figure is small enough to need them.
 */
export function amount(
  rupees: number,
  currency: Currency,
  options: { cents?: boolean } = {},
) {
  const value = inCurrency(rupees, currency);
  const digits = options.cents && currency === "USD" && value < 100 ? 2 : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export const EXCHANGE_NOTE = `$1 = ₹${USD_INR.rupeesPerDollar} (${USD_INR.source}, ${new Date(`${USD_INR.date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })})`;

/** A machine that can break down, by its id in the twin's graph. */
interface Breakable {
  id: string;
  name: string;
}

/** What breakdowns cost a run, in parts, over its days. */
export interface Losses {
  /** Who ran the plant in these measurements. */
  policy: "playbook" | "rules";
  days: number;
  /** The shift as it ran, averaged over the days. */
  base: Kpis;
  /** What it ships with no breakdowns anywhere. */
  possible: number;
  /** Per machine: parts its breakdowns cost, worst first. */
  byMachine: (Breakable & { lostParts: number })[];
  /** Standard rules over the same days, for the agents' comparison. */
  rules: Kpis;
}

/** The twin with these machines' failures taken out: they never break down. */
function withoutFailures(graph: FactoryGraph, ids: Set<string>): FactoryGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (!ids.has(node.id) || !("mtbf" in node)) return node;
      const { mtbf: _mtbf, ...rest } = node;
      return rest as typeof node;
    }),
  };
}

/**
 * Measures where a run's shift loses output to breakdowns: the shift again
 * on its days with no breakdowns anywhere, then with each machine's taken
 * out alone. The crew's playbook runs it when there is one, else standard
 * rules; standard rules always run too, for the agents' comparison.
 */
export async function measureLosses(
  run: CostedRun,
  days: number,
  onProgress?: (done: number, total: number) => void,
): Promise<Losses> {
  const breakable: Breakable[] = run.graph.nodes.flatMap((node) =>
    "mtbf" in node && node.mtbf ? [{ id: node.id, name: node.name }] : [],
  );
  const policy: Policy | undefined = run.playbook
    ? playbookPolicy(run.playbook)
    : undefined;
  const total = 3 + breakable.length;
  let done = 0;
  const measure = async (graph: FactoryGraph, using?: Policy) => {
    const kpis = averageKpis(
      await simulateShiftDays(
        {
          graph,
          scenario: run.scenario,
          seed: run.seed,
          tickMinutes: run.tickMinutes,
        },
        days,
        using,
      ),
    );
    onProgress?.(++done, total);
    // Lets the page paint between measurements.
    await new Promise((resolve) => setTimeout(resolve, 0));
    return kpis;
  };
  const rules = await measure(run.graph);
  const base = policy ? await measure(run.graph, policy) : rules;
  if (!policy) onProgress?.(++done, total);
  const possible = (
    await measure(
      withoutFailures(run.graph, new Set(breakable.map(({ id }) => id))),
      policy,
    )
  ).completed;
  const byMachine: Losses["byMachine"] = [];
  for (const machine of breakable) {
    const fixed = await measure(
      withoutFailures(run.graph, new Set([machine.id])),
      policy,
    );
    byMachine.push({ ...machine, lostParts: fixed.completed - base.completed });
  }
  byMachine.sort((a, b) => b.lostParts - a.lostParts);
  return {
    policy: policy ? "playbook" : "rules",
    days,
    base,
    possible,
    byMachine,
    rules,
  };
}

/** One line of the report: what it is, its money per shift, the count behind it. */
export interface CostLine {
  label: string;
  /** Rupees per shift; positive is money lost, or saved in the comparison. */
  rupees: number;
  detail: string;
}

export interface CostReport {
  /** Where the shift lost money, biggest first, and in all. */
  lost: CostLine[];
  total: number;
  /** Each machine's breakdowns, costliest first. */
  machines: (CostLine & { id: string })[];
  /** The agents against standard rules; null without a playbook to compare. */
  agents: { lines: CostLine[]; net: number } | null;
  /** The figures as lines for the brief writer, as the page shows them. */
  facts: string[];
  /** Every number the page shows, for tracing the brief's numbers. */
  sources: NumberSource[];
}

const one = (value: number) =>
  (Math.round(value * 10) / 10).toLocaleString("en-US", {
    maximumFractionDigits: 1,
  });

/**
 * The cost of a measured shift in the currency shown: what it lost and to
 * what, each machine's share, and what the agents' playbook saves or costs
 * against standard rules. Null without crew work counted.
 */
export function costReport(
  losses: Losses,
  rates: CostRates,
  options: { currency: Currency; unit: string },
): CostReport | null {
  const { currency, unit } = options;
  const lostParts = Math.max(0, losses.possible - losses.base.completed);
  const shift = shiftMoney(losses.base, lostParts, rates);
  const crew = losses.base.crew;
  if (!shift || !crew) return null;
  const money = (rupees: number) => amount(rupees, currency);

  const lost: CostLine[] = [
    {
      label: t("Output lost to breakdowns"),
      rupees: shift.lostOutput,
      detail: t("{0} {1} not made", { 0: one(lostParts), 1: unit }),
    },
    {
      label: t("Scrap"),
      rupees: shift.scrap,
      detail: t("{0} {1} scrapped", { 0: one(losses.base.scrapped), 1: unit }),
    },
    {
      label: t("Repair and service labour"),
      rupees: shift.labour,
      detail: t("{0} crew-hours", { 0: one(crew.hours) }),
    },
    {
      label: t("Spares"),
      rupees: shift.spares,
      detail: t("{0} repairs", { 0: one(crew.repairs) }),
    },
  ].sort((a, b) => b.rupees - a.rupees);

  const machines = losses.byMachine
    .map(({ id, name, lostParts: parts }) => {
      const work = crew.byNode[id];
      const cost = machineMoney(parts, work, rates);
      return {
        id,
        label: name,
        rupees: cost.total,
        detail: t("{0} {1} lost, {2} crew-hours, {3} repairs", {
          0: one(Math.max(0, parts)),
          1: unit,
          2: one(work?.hours ?? 0),
          3: one(work?.repairs ?? 0),
        }),
      };
    })
    .sort((a, b) => b.rupees - a.rupees);

  const versus =
    losses.policy === "playbook"
      ? agentsVsRules(losses.base, losses.rules, rates)
      : null;
  const agents = versus
    ? {
        net: versus.net,
        lines: [
          {
            label: t("Output"),
            rupees: versus.output,
            detail: `${signedOne(losses.base.completed - losses.rules.completed)} ${unit}`,
          },
          {
            label: t("Scrap"),
            rupees: versus.scrap,
            detail: fewerOrMore(
              losses.rules.scrapped - losses.base.scrapped,
              t("{0} scrapped", { 0: unit }),
            ),
          },
          {
            label: t("Labour"),
            rupees: versus.labour,
            detail: fewerOrMore(
              (losses.rules.crew?.hours ?? 0) - crew.hours,
              t("crew-hours"),
            ),
          },
          {
            label: t("Spares"),
            rupees: versus.spares,
            detail: fewerOrMore(
              (losses.rules.crew?.repairs ?? 0) - crew.repairs,
              t("repairs"),
            ),
          },
        ],
      }
    : null;

  const who =
    losses.policy === "playbook"
      ? t("the crew's playbook")
      : t("standard rules");
  const facts = [
    t(
      "The shift as run by {0}, averaged over {1} days: shipped {2} {3}; with no breakdowns it would ship {4}.",
      {
        0: who,
        1: losses.days,
        2: one(losses.base.completed),
        3: unit,
        4: one(losses.possible),
      },
    ),
    ...lost.map((line) =>
      t("{0}: {1} per shift ({2}).", {
        0: line.label,
        1: money(line.rupees),
        2: line.detail,
      }),
    ),
    t("Total lost: {0} per shift, {1} a year at {2} shifts.", {
      0: money(shift.total),
      1: money(shift.total * SHIFTS_PER_YEAR),
      2: SHIFTS_PER_YEAR,
    }),
    ...machines.map((line) =>
      t("Breakdowns at {0}: {1} per shift ({2}).", {
        0: line.label,
        1: money(line.rupees),
        2: line.detail,
      }),
    ),
    agents
      ? t(
          "The agents' playbook against standard rules on the same days: {0} {1} per shift, {2} a year ({3}).",
          {
            0: agents.net >= 0 ? t("saves") : t("costs"),
            1: money(Math.abs(agents.net)),
            2: money(Math.abs(agents.net) * SHIFTS_PER_YEAR),
            3: agents.lines
              .map(
                (line) =>
                  `${line.label.toLowerCase()} ${line.rupees >= 0 ? "+" : "−"}${money(Math.abs(line.rupees))}, ${line.detail}`,
              )
              .join("; "),
          },
        )
      : t("No agents' playbook to compare with standard rules."),
  ];

  const rupeeSources = [
    ...lost.map((line) => [line.label, line.rupees] as const),
    [t("Total lost per shift"), shift.total] as const,
    [t("Total lost a year"), shift.total * SHIFTS_PER_YEAR] as const,
    ...machines.map(
      (line) =>
        [t("Breakdowns at {0}", { 0: line.label }), line.rupees] as const,
    ),
    ...(agents
      ? [
          [t("Agents vs standard rules, per shift"), agents.net] as const,
          [
            t("Agents vs standard rules, a year"),
            agents.net * SHIFTS_PER_YEAR,
          ] as const,
          ...agents.lines.map(
            (line) =>
              [
                t("Agents vs standard rules: {0}", {
                  0: line.label.toLowerCase(),
                }),
                line.rupees,
              ] as const,
          ),
        ]
      : []),
  ];
  const sources: NumberSource[] = [
    ...rupeeSources.map(([label, rupees]) => ({
      label: `${label}: ${money(rupees)}`,
      value: Math.round(inCurrency(rupees, currency)),
      decimals: 0,
    })),
    ...[
      ...facts.flatMap((fact) =>
        // The counts behind the money, as written in the facts.
        [...fact.matchAll(/\(([^)]*)\)/g)].map((match) => match[1]!),
      ),
      `${one(losses.base.completed)} ${one(losses.possible)} ${losses.days} ${SHIFTS_PER_YEAR}`,
    ].flatMap((text) => givenNumbers(t("From the shift's measurements"), text)),
  ];
  return { lost, total: shift.total, machines, agents, facts, sources };
}

/** A difference to one decimal, signed; a difference that rounds away has no sign. */
const signedOne = (value: number) => {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${one(Math.abs(rounded))}`;
};

/** What the agents saved, as "1.5 fewer batches scrapped" or "0.4 more repairs". */
const fewerOrMore = (saved: number, what: string) => {
  const rounded = Math.round(saved * 10) / 10;
  return rounded === 0
    ? t("same {0}", { 0: what })
    : rounded > 0
      ? t("{0} fewer {1}", { 0: one(Math.abs(rounded)), 1: what })
      : t("{0} more {1}", { 0: one(Math.abs(rounded)), 1: what });
};
