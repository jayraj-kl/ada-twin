import type { Baseline, DocumentKind } from "@repo/sim";
import { z } from "zod";
import { type Machine, describeMachine } from "../machines";
import { type AskModel, parseJsonReply } from "../model";
import {
  type NamedFile,
  STATION_PARAMS,
  type StationParamKey,
  type StationParams,
  acceptParam,
  listParams,
} from "../station-parameters";

export const DOCUMENT_KINDS = [
  "overview",
  "plant-record",
  "datasheet",
  "reference",
] as const satisfies readonly DocumentKind[];

/** A document to read, and what it is when that is already known. */
export interface MachineDocument extends NamedFile {
  kind?: DocumentKind;
}

const Value = z.object({
  param: z.string(),
  value: z.number(),
  page: z.number().nullish(),
  quote: z.string().nullish(),
});

const Range = z.object({
  param: z.string(),
  low: z.number(),
  high: z.number(),
  basis: z.enum(["calendar", "operating"]).nullish(),
  page: z.number().nullish(),
  quote: z.string().nullish(),
});

const Reply = z.union([
  // Before documents had kinds, the reader answered with the values alone.
  z.array(Value).transform((values) => ({
    kind: undefined,
    values,
    baselines: [] as z.infer<typeof Range>[],
  })),
  z.object({
    kind: z.enum(DOCUMENT_KINDS).nullish(),
    values: z.array(Value).default([]),
    baselines: z.array(Range).default([]),
  }),
]);

export interface DocumentFindings {
  found: Partial<StationParams>;
  /** Published class ranges, from reference sheets only. */
  baselines: Partial<Record<StationParamKey, Baseline>>;
  /** Each document's kind, as given or as the reader judged it. */
  kinds: Record<string, DocumentKind>;
}

// The machine's own records first: a plant's history outranks a datasheet.
const RANK: Record<DocumentKind | "unknown", number> = {
  "plant-record": 0,
  datasheet: 1,
  unknown: 2,
  reference: 3,
  overview: 4,
};

const KIND_HELP = [
  'Say what the document is, as "kind":',
  '- "plant-record": this plant\'s own records of the machine, such as a maintenance or stoppage log, work orders or production counts',
  '- "datasheet": the maker\'s datasheet, manual or specification for the machine or its model',
  '- "reference": published figures for a whole class of equipment, such as a reliability survey or handbook table',
  '- "overview": about the plant as a whole rather than this machine',
].join("\n");

/**
 * Reads a machine's parameters out of its documents, each with the passage
 * it came from. A plant record outranks a datasheet; a reference sheet gives
 * the class baseline and never a value.
 */
export async function extractFromDocuments(
  ask: AskModel,
  machine: Machine,
  documents: MachineDocument[],
): Promise<DocumentFindings> {
  const read = await Promise.all(
    documents.map(async (document) => {
      const known = document.kind;
      const reply = await ask({
        task: "read-document",
        instruction:
          "You read equipment manuals, datasheets, maintenance records and reliability references for a factory simulation. You report only values the document states, and you quote the passage each one is written in, word for word.",
        files: [document],
        prompt: [
          "The attached document is about this machine:",
          describeMachine(machine),
          "",
          known
            ? `The document is a "${known}". Use that as its kind.`
            : KIND_HELP,
          "",
          "If it is a plant record or a datasheet, find as many of these parameters as it states, as \"values\":",
          listParams(),
          "",
          'If it is a reference, give instead, as "baselines", the published low and high figures it states for the class of equipment, for "mtbf" and "mttr" only, in seconds, and whether its MTBF counts calendar hours or operating hours as "basis".',
          "",
          'Answer with JSON: {"kind": string, "values": [{"param": string, "value": number, "page": number | null, "quote": string}], "baselines": [{"param": string, "low": number, "high": number, "basis": "calendar" | "operating", "page": number | null, "quote": string}]}.',
          "Convert each value to the unit shown, but quote the passage exactly as the document writes it: one sentence or line, copied character for character, that contains the figure. page is the page the passage is on, counting from 1. Where a document states a summary figure, quote the summary. Leave out anything the document does not state; do not estimate.",
        ].join("\n"),
      });
      const answer = Reply.parse(parseJsonReply(reply.text));
      return { document, kind: known ?? answer.kind ?? undefined, answer };
    }),
  );

  const findings: DocumentFindings = { found: {}, baselines: {}, kinds: {} };
  const ordered = [...read].sort(
    (a, b) => RANK[a.kind ?? "unknown"] - RANK[b.kind ?? "unknown"],
  );
  for (const { document, kind, answer } of ordered) {
    if (kind) findings.kinds[document.name] = kind;
    if (kind === "reference") {
      for (const range of answer.baselines) {
        const spec = STATION_PARAMS.find(({ key }) => key === range.param);
        if (
          !spec ||
          spec.unit !== "s" ||
          findings.baselines[spec.key] ||
          !(range.low > 0 && range.high >= range.low) ||
          !range.quote?.trim()
        ) {
          continue;
        }
        findings.baselines[spec.key] = {
          low: range.low,
          high: range.high,
          unit: spec.unit,
          basis: range.basis ?? "calendar",
          document: document.name,
          page: range.page ?? undefined,
          quote: range.quote.trim(),
        };
      }
      continue;
    }
    if (kind === "overview") continue;
    for (const entry of answer.values) {
      acceptParam(findings.found, entry.param, entry.value, {
        kind: "doc",
        document: document.name,
        page: entry.page ?? undefined,
        ...(entry.quote?.trim() ? { quote: entry.quote.trim() } : {}),
        ...(kind ? { documentKind: kind } : {}),
      });
    }
  }
  return findings;
}
