import type { Baseline, DocumentKind } from "@repo/sim";
import {
  type MachineDocument,
  extractFromDocuments,
} from "./agents/document-reader";
import { researchOnWeb } from "./agents/web-researcher";
import type { Machine } from "./machines";
import type { AskModel } from "./model";
import {
  STATION_PARAMS,
  SUPPORT_PARAM_KEYS,
  type StationParamKey,
  type StationParams,
} from "./station-parameters";

export interface FilledParameters {
  params: StationParams;
  /** Parameters nothing was found for, filled with a marked assumption. */
  assumed: StationParamKey[];
  /** Published class ranges from the machine's reference sheets. */
  baselines: Partial<Record<StationParamKey, Baseline>>;
  /** Each document's kind, as given or as the reader judged it. */
  kinds: Record<string, DocumentKind>;
}

/**
 * Fills every station parameter from the best source available: the plant's
 * own records, then datasheets, then the web, then a marked assumption.
 * Reference sheets only give the class baseline beside a value. Support
 * equipment only has its failure and repair times looked up; the rest it
 * never uses, so they are filled with assumptions without being reported.
 */
export async function fillParameters(
  ask: AskModel,
  machine: Machine,
  documents: MachineDocument[] = [],
): Promise<FilledParameters> {
  const { found, baselines, kinds } = await extractFromDocuments(
    ask,
    machine,
    documents,
  );
  const wanted: readonly StationParamKey[] = machine.auxiliary
    ? SUPPORT_PARAM_KEYS
    : STATION_PARAMS.map((param) => param.key);
  const missing = () => wanted.filter((key) => !found[key]);
  const web = await researchOnWeb(ask, machine, missing());
  // A document always outranks the web, even if the model answers for more
  // than it was asked.
  for (const param of STATION_PARAMS) found[param.key] ??= web[param.key];

  const assumed = missing();
  for (const param of STATION_PARAMS) {
    found[param.key] ??= {
      value: param.fallback,
      unit: param.unit,
      provenance: { kind: "assumed" },
    };
  }
  return { params: found as StationParams, assumed, baselines, kinds };
}
