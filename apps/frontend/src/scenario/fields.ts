import type { Scenario } from "@repo/sim";
import type { ScenarioAnswer, ScenarioField } from "@/twin/api";

/** How the form labels each setting, and how it shows a value. */
export const FIELD_LABELS: Record<
  ScenarioField,
  { label: string; show: (value: number | string) => string }
> = {
  name: { label: "Name", show: String },
  shiftHours: { label: "Shift length", show: (v) => `${v} h` },
  demandPerShift: { label: "Demand", show: (v) => `${v} parts per shift` },
  ambientTempC: { label: "Ambient temperature", show: (v) => `${v} °C` },
  supplyDisruption: {
    label: "Supply disrupted",
    show: (v) => `${Math.round(Number(v) * 100)}%`,
  },
  absenteeism: {
    label: "Maintenance staff absent",
    show: (v) => `${Math.round(Number(v) * 100)}%`,
  },
  maintenanceCrews: { label: "Maintenance crews", show: (v) => `${v}` },
  "targets.throughputPerShift": {
    label: "Ship at least",
    show: (v) => `${v} parts`,
  },
  "targets.maxAverageWip": {
    label: "Work in progress under",
    show: (v) => `${v} parts`,
  },
  "targets.maxDownShare": {
    label: "Any station down less than",
    show: (v) => `${Math.round(Number(v) * 100)}%`,
  },
};

const isTarget = (field: ScenarioField) => field.startsWith("targets.");
const targetKey = (field: ScenarioField) =>
  field.slice("targets.".length) as keyof NonNullable<Scenario["targets"]>;

/** A setting's value on `scenario`, or undefined when it is not set. */
export function valueOf(
  scenario: Scenario,
  field: ScenarioField,
): number | string | undefined {
  if (isTarget(field)) return scenario.targets?.[targetKey(field)];
  return scenario[field as Exclude<ScenarioField, `targets.${string}`>];
}

/** `scenario` with an answer's changes and briefing made. */
export function applyAnswer(
  scenario: Scenario,
  answer: Pick<ScenarioAnswer, "changes" | "briefing">,
): Scenario {
  const next: Scenario = { ...scenario, targets: { ...scenario.targets } };
  const fields = next as unknown as Record<string, unknown>;
  const targets = next.targets as Record<string, unknown>;
  for (const { field, value } of answer.changes) {
    const [holder, key] = isTarget(field)
      ? [targets, targetKey(field)]
      : [fields, field];
    if (value === null) delete holder[key];
    else holder[key] = value;
  }
  if (answer.briefing !== null) next.briefing = answer.briefing;
  return next;
}
