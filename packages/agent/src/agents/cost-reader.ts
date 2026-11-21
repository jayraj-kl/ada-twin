import { COST_RATES, type CostRateKey } from "@repo/sim";
import { z } from "zod";
import { type AskModel, parseJsonReply } from "../model";
import type { NamedFile } from "../station-parameters";

const Reply = z.array(
  z.object({
    rate: z.string(),
    value: z.number(),
    page: z.number().nullish(),
    quote: z.string().nullish(),
  }),
);

/** A rate read from a document, with the passage it is written in. */
export interface ReadRate {
  /** In rupees. */
  value: number;
  document: string;
  page?: number;
  quote: string;
}

/**
 * Reads a plant's cost rates out of its cost sheet, each with the passage it
 * came from, so the verifier can check it. Only rupee figures the document
 * states are kept; nothing is estimated or converted.
 */
export async function readCostRates(
  ask: AskModel,
  document: NamedFile,
): Promise<Partial<Record<CostRateKey, ReadRate>>> {
  const reply = await ask({
    task: "read-cost-sheet",
    instruction:
      "You read a factory's cost sheet for a cost model. You report only figures the document states, in Indian rupees, and you quote the passage each one is written in, word for word.",
    files: [document],
    prompt: [
      "Find these rates in the attached document:",
      ...COST_RATES.map(
        ({ key, meaning, per }) => `- "${key}" (rupees per ${per}): ${meaning}`,
      ),
      "",
      'Answer with only a JSON array of {"rate": string, "value": number, "page": number | null, "quote": string}.',
      "quote is the one sentence or line that states the figure, copied character for character. page counts from 1. Leave out any rate the document does not state in rupees; do not estimate or convert.",
    ].join("\n"),
  });
  const rates: Partial<Record<CostRateKey, ReadRate>> = {};
  for (const entry of Reply.parse(parseJsonReply(reply.text))) {
    const spec = COST_RATES.find(({ key }) => key === entry.rate);
    if (!spec || rates[spec.key] || !(entry.value >= 0) || !entry.quote?.trim()) {
      continue;
    }
    rates[spec.key] = {
      value: entry.value,
      document: document.name,
      page: entry.page ?? undefined,
      quote: entry.quote.trim(),
    };
  }
  return rates;
}
