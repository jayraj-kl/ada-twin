import type { CrewWork, Kpis } from "./kpi";

/**
 * What a plant's shift costs, from four rates in rupees. Each comes from the
 * plant's cost sheet or is typed in by the user; none is a guess.
 */
export const COST_RATES = [
  {
    key: "contributionPerPart",
    label: "Value of a part not shipped",
    meaning: "what the plant loses for each part it fails to make: its margin, or what replacing it costs",
    per: "part",
  },
  {
    key: "scrapCostPerPart",
    label: "Cost of a scrapped part",
    meaning: "material, energy and work thrown away with each scrapped part",
    per: "part",
  },
  {
    key: "technicianPerHour",
    label: "Technician time",
    meaning: "the loaded cost of one maintenance technician for one hour",
    per: "hour",
  },
  {
    key: "sparesPerRepair",
    label: "Spares per repair",
    meaning: "the average cost of parts and consumables used in one breakdown repair",
    per: "repair",
  },
] as const;

export type CostRateKey = (typeof COST_RATES)[number]["key"];
/** The rates in Indian rupees. */
export type CostRates = Record<CostRateKey, number>;

/** One shift in money, in rupees: what it lost, by cause. */
export interface ShiftMoney {
  /** Parts breakdowns kept it from making, at the value of a part. */
  lostOutput: number;
  scrap: number;
  /** Crew time on repairs and services. */
  labour: number;
  spares: number;
  total: number;
}

const sum = (lines: Omit<ShiftMoney, "total">): ShiftMoney => ({
  ...lines,
  total: lines.lostOutput + lines.scrap + lines.labour + lines.spares,
});

/**
 * What a shift lost: `lostParts` it would have made with no breakdowns, its
 * scrap, and its crews' work. Null without crew work counted (older runs).
 */
export function shiftMoney(
  kpis: Kpis,
  lostParts: number,
  rates: CostRates,
): ShiftMoney | null {
  if (!kpis.crew) return null;
  return sum({
    lostOutput: Math.max(0, lostParts) * rates.contributionPerPart,
    scrap: kpis.scrapped * rates.scrapCostPerPart,
    labour: kpis.crew.hours * rates.technicianPerHour,
    spares: kpis.crew.repairs * rates.sparesPerRepair,
  });
}

/** What one machine's breakdowns cost a shift: lost parts and its crew work. */
export function machineMoney(
  lostParts: number,
  crew: CrewWork | undefined,
  rates: CostRates,
): ShiftMoney {
  return sum({
    lostOutput: Math.max(0, lostParts) * rates.contributionPerPart,
    scrap: 0,
    labour: (crew?.hours ?? 0) * rates.technicianPerHour,
    spares: (crew?.repairs ?? 0) * rates.sparesPerRepair,
  });
}

/** What the agents' way of working is worth against standard rules, per shift. */
export interface AgentsVsRules {
  /** Extra parts shipped, at the value of a part; negative when fewer. */
  output: number;
  /** Scrap avoided; negative when the agents scrapped more. */
  scrap: number;
  /** Crew time saved; negative when the agents kept the crews busier. */
  labour: number;
  /** Spares saved; negative when the agents needed more repairs. */
  spares: number;
  /** All of it: what the agents save each shift, or cost when negative. */
  net: number;
}

/** The agents against standard rules over the same days, in rupees per shift. */
export function agentsVsRules(
  agents: Kpis,
  rules: Kpis,
  rates: CostRates,
): AgentsVsRules | null {
  if (!agents.crew || !rules.crew) return null;
  const output = (agents.completed - rules.completed) * rates.contributionPerPart;
  const scrap = (rules.scrapped - agents.scrapped) * rates.scrapCostPerPart;
  const labour = (rules.crew.hours - agents.crew.hours) * rates.technicianPerHour;
  const spares = (rules.crew.repairs - agents.crew.repairs) * rates.sparesPerRepair;
  return { output, scrap, labour, spares, net: output + scrap + labour + spares };
}

/** Shifts in a year at one shift a day, 5 days a week, 52 weeks. */
export const SHIFTS_PER_YEAR = 260;

/**
 * The one exchange rate dollars are shown at: FBIL's USD/INR reference rate
 * (FBIL has published the RBI reference rate since 2018), as archived by MSEI.
 */
export const USD_INR = {
  rupeesPerDollar: 92.9699,
  date: "2026-11-20",
  source: "FBIL USD/INR reference rate, MSEI archive",
  url: "https://www.msei.in/markets/Currency/Historical-Data/RBIReferenceRateArchives.aspx",
} as const;

export type Currency = "INR" | "USD";

/** Rupees in the currency shown. */
export const inCurrency = (rupees: number, currency: Currency) =>
  currency === "INR" ? rupees : rupees / USD_INR.rupeesPerDollar;
