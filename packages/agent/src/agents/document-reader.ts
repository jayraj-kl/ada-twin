import { z } from "zod";
import { type Machine, describeMachine } from "../machines";
import { type AskModel, parseJsonReply } from "../model";
import {
  type NamedFile,
  type StationParams,
  acceptParam,
  listParams,
} from "../station-parameters";

const Reply = z.array(
  z.object({
    param: z.string(),
    value: z.number(),
    page: z.number().nullish(),
  }),
);

/** Reads a machine's parameters out of the user's own documents. */
export async function extractFromDocuments(
  ask: AskModel,
  machine: Machine,
  documents: NamedFile[],
): Promise<Partial<StationParams>> {
  const found: Partial<StationParams> = {};
  for (const document of documents) {
    const reply = await ask({
      instruction:
        "You read equipment manuals, datasheets and maintenance records for a factory simulation. You report only values the document states or that follow from it by simple arithmetic.",
      files: [document],
      prompt: [
        "The attached document is about this machine:",
        describeMachine(machine),
        "",
        "Find as many of these parameters as the document supports:",
        listParams(),
        "",
        'Answer with a JSON array of {"param": string, "value": number, "page": number | null}. Convert to the unit shown. Leave out any parameter the document does not support; do not estimate.',
      ].join("\n"),
    });
    for (const entry of Reply.parse(parseJsonReply(reply.text))) {
      acceptParam(found, entry.param, entry.value, {
        kind: "doc",
        document: document.name,
        page: entry.page ?? undefined,
      });
    }
  }
  return found;
}
