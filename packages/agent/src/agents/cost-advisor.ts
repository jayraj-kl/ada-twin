import { z } from "zod";
import { type AskModel, parseJsonReply } from "../model";

const Answer = z.object({ brief: z.string().default("") });

/**
 * Writes a few sentences of cost feedback on a shift from the money the
 * page worked out: where it lost most, what to fix first, and whether the
 * agents pay for themselves. It explains the figures; it never makes them.
 * The page traces every number it writes back to the ones it was given.
 */
export async function adviseOnCost(
  ask: AskModel,
  options: {
    plant: string;
    /** What the plant makes, plural. */
    unit: string;
    /** The figures, one per line, written as the reader will see them. */
    facts: string[];
  },
): Promise<string> {
  if (options.facts.length === 0) return "";
  const reply = await ask({
    task: "advise-on-cost",
    instruction:
      "You give a plant manager short, plain cost feedback on one shift of their plant. You use only the figures you are given, written exactly as given, and never invent, round or convert one.",
    prompt: [
      `Plant: ${options.plant}. It makes ${options.unit}.`,
      "",
      "What one shift cost, as the cost model worked it out:",
      ...options.facts.map((fact) => `- ${fact}`),
      "",
      "Write 3 or 4 sentences: where the shift lost the most money and why, which machine to fix first, and whether the agents' way of working saves money against standard rules. Copy every amount and count exactly as it is written above, currency sign and separators included; do not add up, round or convert anything.",
      'Answer with JSON: {"brief": string}.',
    ].join("\n"),
  });
  return Answer.parse(parseJsonReply(reply.text)).brief.trim();
}
