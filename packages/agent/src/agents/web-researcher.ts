import { z } from "zod";
import { type Machine, describeMachine } from "../machines";
import { type AskModel, parseJsonReply } from "../model";
import {
  type StationParamKey,
  type StationParams,
  acceptParam,
  listParams,
} from "../station-parameters";

const Reply = z.array(
  z.object({
    param: z.string(),
    value: z.number(),
    url: z.string(),
    quote: z.string().nullish(),
    confidence: z.enum(["datasheet", "typical"]),
  }),
);

/**
 * Looks a machine up on the web. A value from this exact model's published
 * data is marked "datasheet"; a figure that is only typical for its kind of
 * equipment is marked "typical".
 */
export async function researchOnWeb(
  ask: AskModel,
  machine: Machine,
  wanted: StationParamKey[],
): Promise<Partial<StationParams>> {
  const found: Partial<StationParams> = {};
  if (wanted.length === 0) return found;
  const reply = await ask({
    task: "research-web",
    search: true,
    instruction:
      "You research industrial equipment for a factory simulation. Prefer the manufacturer's own datasheets and manuals, then standards bodies and engineering references. Avoid forums and reseller listings. Never invent a source.",
    prompt: [
      "Search the web for this machine:",
      describeMachine(machine),
      "",
      "Find these parameters:",
      listParams(wanted),
      "",
      'Answer with only a JSON array of {"param": string, "value": number, "url": string, "quote": string, "confidence": "datasheet" | "typical"}.',
      '"datasheet" means the value is published for this exact manufacturer and model. "typical" means it is a representative figure for this kind of equipment; reliability and scrap figures are usually only available this way.',
      "url is the page the value came from and quote is the passage. Leave out any parameter you found no source for.",
    ].join("\n"),
  });
  for (const entry of Reply.parse(parseJsonReply(reply.text))) {
    if (!URL.canParse(entry.url) || !entry.url.startsWith("http")) continue;
    acceptParam(found, entry.param, entry.value, {
      kind: "web",
      url: entry.url,
      quote: entry.quote ?? undefined,
      confidence: entry.confidence,
    });
  }
  return found;
}
