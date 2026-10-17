import { z } from "zod";
import { type AskModel, parseJsonReply } from "../model";

/** An applied change with what the report measured for it. */
export interface RankedChange {
  id: string;
  title: string;
  detail: string;
  tier: "critical" | "high" | "medium" | "low";
  /** Parts per shift the redesign loses without it, averaged over days. */
  marginal: number;
  /** Parts per shift it gains on its own. */
  solo: number;
  /** Its cost, in words, if it was looked up. */
  cost?: string;
}

export interface ChangeReport {
  /** Two or three sentences on the redesign as a whole. */
  summary: string;
  /** A short paragraph per change, by id. */
  paragraphs: Record<string, string>;
}

const Answer = z.object({
  summary: z.string().default(""),
  paragraphs: z
    .array(z.object({ id: z.string(), text: z.string() }))
    .default([]),
});

const signed = (value: number) =>
  `${value > 0 ? "+" : ""}${Math.round(value * 10) / 10}`;

/**
 * Writes the applied-changes report: why each change matters for this
 * scenario, from the numbers the simulation measured. It explains the
 * ranking; it does not make it.
 */
export async function explainChanges(
  ask: AskModel,
  options: {
    scenario: string;
    goal?: string;
    /** Parts per shift before and after, on standard rules. */
    before: number;
    after: number;
    bottleneck?: string;
    changes: RankedChange[];
  },
): Promise<ChangeReport> {
  const { changes } = options;
  if (changes.length === 0) return { summary: "", paragraphs: {} };
  const reply = await ask({
    task: "explain-changes",
    instruction:
      "You write short, plain reports for plant managers about changes to their plant. You use only the numbers you are given and never invent new ones.",
    prompt: [
      `Scenario: ${options.scenario}.`,
      options.goal ? `Goal: ${options.goal}` : "",
      `Before the changes the plant shipped ${Math.round(options.before)} parts per shift; with all of them, ${Math.round(options.after)}.`,
      options.bottleneck ? `The bottleneck before was ${options.bottleneck}.` : "",
      "",
      "The changes, most critical first:",
      ...changes.map(
        (change) =>
          `- id "${change.id}": ${change.title} [${change.tier}]. ${change.detail} Without it the redesign ships ${signed(-change.marginal)} parts per shift; on its own it gains ${signed(change.solo)}.${change.cost ? ` Cost: ${change.cost}.` : ""}`,
      ),
      "",
      "Write a summary of two or three sentences for the redesign as a whole, and for each change a paragraph of two to four sentences: what it does, why it matters for this scenario, and what the numbers say. When a change gains little on its own but a lot together with the others, say so.",
      'Answer with JSON: {"summary": string, "paragraphs": [{"id": string, "text": string}]}.',
    ]
      .filter(Boolean)
      .join("\n"),
  });
  const answer = Answer.parse(parseJsonReply(reply.text));
  const known = new Set(changes.map(({ id }) => id));
  return {
    summary: answer.summary.trim(),
    paragraphs: Object.fromEntries(
      answer.paragraphs
        .filter(({ id, text }) => known.has(id) && text.trim())
        .map(({ id, text }) => [id, text.trim()]),
    ),
  };
}
