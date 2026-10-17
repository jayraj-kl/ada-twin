import { z } from "zod";
import { type Machine, describeMachine } from "../machines";
import { type AskModel, parseJsonReply } from "../model";

/** One recommended change to a plant, as the report proposes it. */
export interface CostedChange {
  id: string;
  title: string;
  /** Why it is proposed, from the run's own numbers. */
  detail: string;
  /** The machine it changes; none for, say, a maintenance crew. */
  machine?: Machine;
}

export interface CostRange {
  low: number;
  high: number;
}

export interface CostEstimate {
  /** The change it prices. */
  id: string;
  currency: string;
  /** Paid once: equipment, installation, tooling. Null if there is none. */
  oneOff: CostRange | null;
  /** Paid every year: wages, service contracts, energy. Null if there is none. */
  yearly: CostRange | null;
  /** What the figures assume, in a sentence or two. */
  basis: string;
  /** Pages the figures came from; empty when they are only the model's estimate. */
  sources: { url: string; title?: string }[];
}

const Range = z
  .object({ low: z.number().nonnegative(), high: z.number().nonnegative() })
  .nullish();

const Reply = z.array(
  z.object({
    id: z.string(),
    oneOff: Range,
    yearly: Range,
    basis: z.string(),
    sources: z
      .array(z.object({ url: z.string(), title: z.string().nullish() }))
      .nullish(),
  }),
);

const ordered = (range: z.infer<typeof Range>): CostRange | null =>
  range
    ? { low: Math.min(range.low, range.high), high: Math.max(range.low, range.high) }
    : null;

/**
 * Prices each change from what the web says equipment, installation and labour
 * cost, in one search. A figure is never presented as more than it is: a page
 * it came from is kept as a source, and with no source it is the model's
 * estimate, which the report says.
 */
export async function estimateCosts(
  ask: AskModel,
  changes: CostedChange[],
  options: { currency?: string; location?: string } = {},
): Promise<CostEstimate[]> {
  if (changes.length === 0) return [];
  const currency = options.currency ?? "USD";
  const reply = await ask({
    search: true,
    instruction:
      "You estimate the cost of changes to a factory for an engineering report. Prefer manufacturers' and distributors' published prices, government wage statistics and industry cost guides. Give ranges, not single figures, and never invent a source.",
    prompt: [
      `Search the web and estimate, in ${currency}${options.location ? ` for a plant in ${options.location}` : ""}, what each of these changes would cost:`,
      "",
      ...changes.flatMap((change) => [
        `## id "${change.id}": ${change.title}`,
        change.detail,
        ...(change.machine ? ["Machine:", describeMachine(change.machine)] : []),
        "",
      ]),
      `Answer with only a JSON array, one entry per id: {"id": string, "oneOff": {"low": number, "high": number} | null, "yearly": {"low": number, "high": number} | null, "basis": string, "sources": [{"url": string, "title": string}]}.`,
      "oneOff is paid once (equipment, installation, commissioning, tooling); yearly is paid every year (wages, service, energy). Use null where a change has no such cost.",
      "basis says in one or two sentences what the range assumes, such as which equipment class or wage. sources are the pages the figures came from; leave the list empty if the range is your own estimate.",
    ].join("\n"),
  });

  const wanted = new Set(changes.map(({ id }) => id));
  const estimates: CostEstimate[] = [];
  for (const entry of Reply.parse(parseJsonReply(reply.text))) {
    if (!wanted.has(entry.id)) continue;
    wanted.delete(entry.id);
    estimates.push({
      id: entry.id,
      currency,
      oneOff: ordered(entry.oneOff),
      yearly: ordered(entry.yearly),
      basis: entry.basis,
      sources: (entry.sources ?? []).flatMap(({ url, title }) =>
        URL.canParse(url) && url.startsWith("http")
          ? [{ url, title: title ?? undefined }]
          : [],
      ),
    });
  }
  return estimates;
}
