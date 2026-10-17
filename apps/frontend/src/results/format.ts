import type { CostEstimate, CostRange } from "@/twin/api";
import type { StoredRun } from "@/twin/project";

export const CURRENCIES = ["USD", "EUR", "GBP", "INR"];

/** A cost estimate is kept per currency and per change. */
export const costKey = (currency: string, change: { title: string }) =>
  `${currency}:${change.title}`;

export function money(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function moneyRange({ low, high }: CostRange, currency: string) {
  return low === high
    ? money(low, currency)
    : `${money(low, currency)}–${money(high, currency)}`;
}

/** What a change costs for each part per shift it gains, at the middle of its range. */
export function perPart(estimate: CostEstimate, gain: number) {
  if (gain <= 0 || !estimate.oneOff) return null;
  return (estimate.oneOff.low + estimate.oneOff.high) / 2 / gain;
}

export const signed = (value: number, digits = 0) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}`;

export function headline(run: StoredRun): string {
  const gained = run.kpis.completed - run.baseline.completed;
  const target = run.scenario.targets?.throughputPerShift;
  const crew =
    run.agents.length === 0
      ? "No agents ran this shift"
      : gained > 0
        ? `The crew shipped ${gained} more parts than standard rules`
        : gained < 0
          ? `The crew shipped ${-gained} fewer parts than standard rules`
          : "The crew matched standard rules";
  if (!target) return crew;
  return run.kpis.completed >= target
    ? `${crew}, and the target of ${target} was met`
    : `${crew}, but the plant is ${target - run.kpis.completed} short of ${target}`;
}
