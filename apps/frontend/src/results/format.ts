import type { CostEstimate, CostRange } from "@/twin/api";

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

/** A change in a count averaged over days: whole when it is whole, else to one decimal. */
export const signedAverage = (value: number) =>
  signed(value, Number.isInteger(value) ? 0 : 1);
