import type { Param, Provenance } from "@repo/sim";
import type { ModelFile } from "./model";

/** The numbers a station needs before it can be simulated. */
export const STATION_PARAMS = [
  {
    key: "cycleTime",
    unit: "s",
    meaning: "mean seconds for one machine to process one unit of work",
    fallback: 120,
  },
  {
    key: "cycleTimeVariation",
    unit: "share",
    meaning:
      "spread of the cycle time, as standard deviation divided by mean (0 to 1)",
    fallback: 0.25,
  },
  {
    key: "mtbf",
    unit: "s",
    meaning: "mean seconds of running between failures",
    fallback: 4 * 3600,
  },
  {
    key: "mttr",
    unit: "s",
    meaning: "mean seconds to repair after a failure",
    fallback: 20 * 60,
  },
  {
    key: "scrapRate",
    unit: "share",
    meaning: "share of output scrapped (0 to 1)",
    fallback: 0.01,
  },
] as const;

export type StationParamKey = (typeof STATION_PARAMS)[number]["key"];

/** The only numbers support equipment is simulated with. */
export const SUPPORT_PARAM_KEYS = [
  "mtbf",
  "mttr",
] as const satisfies readonly StationParamKey[];
export type StationParams = Record<StationParamKey, Param>;

export interface NamedFile extends ModelFile {
  name: string;
}

/** The parameters as a prompt list, all of them or only the `wanted` ones. */
export function listParams(wanted?: StationParamKey[]): string {
  return STATION_PARAMS.filter((param) => !wanted || wanted.includes(param.key))
    .map((param) => `- "${param.key}" (${param.unit}): ${param.meaning}`)
    .join("\n");
}

/** Records a value an agent reported, if it is one we asked for and possible. */
export function acceptParam(
  found: Partial<StationParams>,
  key: string,
  value: number,
  provenance: Provenance,
) {
  const spec = STATION_PARAMS.find((param) => param.key === key);
  // Ignore keys we did not ask for, impossible values, and anything an
  // earlier, better source already supplied.
  if (!spec || found[spec.key] || !Number.isFinite(value) || value < 0) return;
  if (spec.unit === "share" && value > 1) return;
  if (spec.unit === "s" && value === 0) return;
  found[spec.key] = { value, unit: spec.unit, provenance };
}
