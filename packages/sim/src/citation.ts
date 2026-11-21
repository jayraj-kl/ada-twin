import type { Baseline, Param } from "./graph";

/** A figure as a claim about a document: the passage must state these values. */
export interface Citation {
  /** The parameter it is for, and whether it is the value or the class baseline. */
  key: string;
  role: "value" | "baseline";
  document: string;
  page?: number;
  quote: string;
  values: { value: number; unit: string }[];
}

/**
 * Every figure of a machine that cites a passage of a document, as claims a
 * verifier can check. Figures with no quoted passage cite nothing checkable
 * and are left out.
 */
export function citationsOf(
  params: Partial<Record<string, Param>> = {},
  baselines: Partial<Record<string, Baseline>> = {},
): Citation[] {
  const values = Object.entries(params).flatMap(([key, param]) => {
    const source = param?.provenance;
    return source?.kind === "doc" && source.quote
      ? [
          {
            key,
            role: "value" as const,
            document: source.document,
            page: source.page,
            quote: source.quote,
            values: [{ value: param!.value, unit: param!.unit }],
          },
        ]
      : [];
  });
  const ranges = Object.entries(baselines).flatMap(([key, baseline]) =>
    baseline
      ? [
          {
            key,
            role: "baseline" as const,
            document: baseline.document,
            page: baseline.page,
            quote: baseline.quote,
            values: [
              { value: baseline.low, unit: baseline.unit },
              { value: baseline.high, unit: baseline.unit },
            ],
          },
        ]
      : [],
  );
  return [...values, ...ranges];
}

export type RangeStatus = "within" | "outside" | "not-comparable";

/**
 * Where a plant's figure sits against its class baseline. A calendar-hour
 * MTBF counts idle hours too, so its range is widened down to `low × duty`,
 * duty being the share of the year the plant runs.
 */
export function rangeStatus(
  value: number,
  baseline: Baseline | undefined,
  options: { key: string; duty: number },
): { status: RangeStatus; low?: number; high?: number } {
  if (!baseline) return { status: "not-comparable" };
  const low =
    options.key === "mtbf" && baseline.basis === "calendar"
      ? baseline.low * options.duty
      : baseline.low;
  const { high } = baseline;
  return {
    status: value >= low && value <= high ? "within" : "outside",
    low,
    high,
  };
}

/** Share of the year a plant runs: one shift of `shiftHours`, 5 days a week. */
export const dutyOf = (shiftHours: number) =>
  Math.min(1, (shiftHours * 5 * 52) / 8760);
