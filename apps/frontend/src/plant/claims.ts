import {
  type NumberSource,
  type Scenario,
  type TracedPiece,
  givenNumbers,
  traceNumbers,
} from "@repo/sim";

import { t } from "../lib/i18n";
/** What the trace reads of the plant report; a `PlantReport` is one. */
export interface WrittenReport {
  before: number;
  after: number;
  rows: { id: string; marginal: number; solo: number }[];
  summary?: string;
  paragraphs?: Record<string, string>;
}

export interface TracedReport {
  summary: TracedPiece[];
  paragraphs: Record<string, TracedPiece[]>;
  /** Numbers in the written report that match nothing it was given, as written. */
  misses: string[];
}

const fixed = (value: number, decimals: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(decimals)}`;

/**
 * Traces every number in the written report to what the writer was shown:
 * the measured before and after and each change's gains, as rounded for it,
 * the few figures worked out from those, and the numbers in the text it read.
 * A paragraph names its own change's numbers first.
 */
export function traceReport(
  report: WrittenReport,
  options: {
    changes: { id: string; title: string; detail: string }[];
    scenario: Scenario;
    bottleneck?: string;
    /** Each change's cost as the writer read it, by id. */
    costs: Record<string, string | undefined>;
    /** What the plant makes, plural: "parts". */
    unit: string;
  },
): TracedReport {
  const { changes, scenario, unit } = options;
  const before = Math.round(report.before);
  const after = Math.round(report.after);
  const titleOf = (id: string) =>
    changes.find((change) => change.id === id)?.title ?? id;
  const ownOf = (row: WrittenReport["rows"][number]): NumberSource[] => {
    const title = titleOf(row.id);
    return [
      {
        label: t("{0}, without it: {1} {2}/shift", {
          0: title,
          1: fixed(-row.marginal, 1),
          2: unit,
        }),
        value: row.marginal,
        decimals: 1,
      },
      {
        label: t("{0}, on its own: {1} {2}/shift", {
          0: title,
          1: fixed(row.solo, 1),
          2: unit,
        }),
        value: row.solo,
        decimals: 1,
      },
    ];
  };
  const soloSum = report.rows.reduce(
    (sum, row) => sum + Math.round(row.solo * 10) / 10,
    0,
  );
  const plant: NumberSource[] = [
    {
      label: t("Before the changes: {0} {1}/shift", { 0: before, 1: unit }),
      value: before,
      decimals: 0,
    },
    {
      label: t("With the changes: {0} {1}/shift", { 0: after, 1: unit }),
      value: after,
      decimals: 0,
    },
    {
      label: t("Gain with the changes: {0} {1}/shift", {
        0: fixed(after - before, 0),
        1: unit,
      }),
      value: after - before,
      decimals: 0,
    },
    {
      label: t("Gain with the changes: {0} {1}/shift", {
        0: fixed(report.after - report.before, 1),
        1: unit,
      }),
      value: report.after - report.before,
      decimals: 1,
    },
    ...(before > 0
      ? [
          {
            label: t("Gain over before: {0}%", {
              0: fixed(((after - before) / before) * 100, 1),
            }),
            value: ((after - before) / before) * 100,
            decimals: 1,
            percent: true,
          },
        ]
      : []),
    {
      label: t("The changes' own gains added up: {0} {1}/shift", {
        0: fixed(soloSum, 1),
        1: unit,
      }),
      value: soloSum,
      decimals: 1,
    },
    {
      label: t("Number of changes: {0}", { 0: report.rows.length }),
      value: report.rows.length,
      decimals: 0,
    },
  ];
  const targets = scenario.targets;
  const goal = [
    `${scenario.name} ${scenario.briefing ?? ""}`,
    t("{0}-hour shift", { 0: scenario.shiftHours }),
    targets?.throughputPerShift ? `${targets.throughputPerShift}` : "",
    targets?.maxAverageWip ? `${targets.maxAverageWip}` : "",
    targets?.maxDownShare ? `${Math.round(targets.maxDownShare * 100)}%` : "",
    options.bottleneck ?? "",
  ].join(" ");
  const given: NumberSource[] = [
    ...givenNumbers(t("From the scenario"), goal),
    ...changes.flatMap((change) => [
      ...givenNumbers(
        t('From the change "{0}"', { 0: change.title }),
        `${change.title} ${change.detail}`,
      ),
      ...givenNumbers(
        t('Cost of "{0}": {1}', {
          0: change.title,
          1: options.costs[change.id] ?? "",
        }),
        options.costs[change.id] ?? "",
      ),
    ]),
  ];
  const everyChange = report.rows.flatMap(ownOf);

  const summary = traceNumbers(report.summary ?? "", [
    ...plant,
    ...everyChange,
    ...given,
  ]);
  const paragraphs = Object.fromEntries(
    report.rows.flatMap((row) => {
      const text = report.paragraphs?.[row.id];
      return text
        ? [
            [
              row.id,
              traceNumbers(text, [
                ...ownOf(row),
                ...plant,
                ...everyChange,
                ...given,
              ]),
            ],
          ]
        : [];
    }),
  );
  const misses = [summary, ...Object.values(paragraphs)].flatMap((pieces) =>
    pieces.flatMap((piece) =>
      piece.number && piece.source === null ? [piece.text] : [],
    ),
  );
  return { summary, paragraphs, misses };
}
