import type { Scenario } from "@repo/sim";
import { z } from "zod";
import { type AskModel, parseJsonReply } from "../model";
import type { DesignMessage } from "./plant-designer";

/** A setting of the scenario the user can describe in words. */
export type ScenarioField =
  | "name"
  | "shiftHours"
  | "demandPerShift"
  | "ambientTempC"
  | "supplyDisruption"
  | "absenteeism"
  | "maintenanceCrews"
  | "targets.throughputPerShift"
  | "targets.maxAverageWip"
  | "targets.maxDownShare";

interface FieldSpec {
  field: ScenarioField;
  /** What it means, as the model is told it. */
  meaning: string;
  kind: "text" | "count" | "number" | "share";
  min?: number;
  max?: number;
  /** Whether it can be left unset; the name and shift length cannot. */
  optional: boolean;
}

const FIELDS: FieldSpec[] = [
  { field: "name", meaning: "a short name for the scenario", kind: "text", optional: false },
  { field: "shiftHours", meaning: "length of the shift in hours", kind: "number", min: 1, max: 24, optional: false },
  { field: "demandPerShift", meaning: "parts released into the plant per shift, across all sources; unset keeps the plant's own rate", kind: "count", min: 1, optional: true },
  { field: "ambientTempC", meaning: "ambient temperature in °C; above 25 °C machines cycle slower and fail sooner", kind: "number", min: -20, max: 60, optional: true },
  { field: "supplyDisruption", meaning: "share of incoming supply lost, 0 to 0.9", kind: "share", min: 0, max: 0.9, optional: true },
  { field: "absenteeism", meaning: "share of maintenance staff absent, 0 to 1", kind: "share", min: 0, max: 1, optional: true },
  { field: "maintenanceCrews", meaning: "maintenance crews on shift, each doing one repair or service at a time", kind: "count", min: 1, max: 20, optional: true },
  { field: "targets.throughputPerShift", meaning: "target: ship at least this many parts in the shift", kind: "count", min: 1, optional: true },
  { field: "targets.maxAverageWip", meaning: "target: keep average work in progress under this many parts", kind: "count", min: 1, optional: true },
  { field: "targets.maxDownShare", meaning: "target: keep every station down less than this share of the time, 0 to 1", kind: "share", min: 0.01, max: 1, optional: true },
];

export interface ScenarioChange {
  field: ScenarioField;
  /** The new value, or null to unset an optional setting. */
  value: number | string | null;
  reason: string;
}

export interface ScenarioAnswer {
  /** What it understood, or a question back. */
  reply: string;
  changes: ScenarioChange[];
  /** A new crew briefing, or null to keep the current one. */
  briefing: string | null;
  /** What the user described that the simulation cannot model yet. */
  notModelled: string[];
}

const Answer = z.object({
  reply: z.string().default(""),
  changes: z
    .array(
      z.object({
        field: z.string(),
        value: z.union([z.number(), z.string(), z.null()]),
        reason: z.string().default(""),
      }),
    )
    .default([]),
  briefing: z.string().nullish(),
  notModelled: z.array(z.string()).nullish(),
});

/** A setting's current value, read off the scenario. */
function currentValue(
  scenario: Scenario,
  field: ScenarioField,
): number | string | undefined {
  if (field.startsWith("targets.")) {
    const key = field.slice("targets.".length) as keyof NonNullable<
      Scenario["targets"]
    >;
    return scenario.targets?.[key];
  }
  return scenario[field as Exclude<ScenarioField, `targets.${string}`>] as
    | number
    | string
    | undefined;
}

/** The value a spec allows: in range, whole where it counts things. */
function fit(spec: FieldSpec, value: number | string | null) {
  if (value === null) return spec.optional ? null : undefined;
  if (spec.kind === "text") {
    return typeof value === "string" && value.trim()
      ? value.trim().slice(0, 80)
      : undefined;
  }
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return undefined;
  const clamped = Math.min(
    spec.max ?? Infinity,
    Math.max(spec.min ?? -Infinity, number),
  );
  return spec.kind === "count" ? Math.round(clamped) : clamped;
}

/** What the plant can make and what it counts, as both prompts tell it. */
export interface PlantContext {
  /** Units its bottleneck can finish in a shift, worked out from the twin. */
  capacityPerShift?: number;
  /** What it makes, plural: "parts", "batches", "motors". */
  unit?: string;
}

function plantLines({ capacityPerShift, unit }: PlantContext): string[] {
  const counted = unit?.trim() || "parts";
  return [
    `The plant counts its work in ${counted}; "parts" in the settings below means ${counted}.`,
    ...(capacityPerShift && capacityPerShift > 0
      ? [
          `At its current figures the plant can finish about ${Math.round(capacityPerShift)} ${counted} in an 8-hour shift. Size amounts against that: a rush order is somewhat above it, a quiet shift well below it. Never suggest amounts many times larger.`,
        ]
      : []),
  ];
}

const show = (value: number | string | undefined) =>
  value === undefined ? "not set" : JSON.stringify(value);

/**
 * Turns a scenario described in plain words ("a hot week in July, two
 * fitters off sick") into changes to the scenario's settings and a short
 * briefing for the crew. What the simulation cannot do is named, not
 * guessed at: it goes in `notModelled` and never into the briefing.
 */
export async function describeScenario(
  ask: AskModel,
  options: {
    scenario: Scenario;
    /** The plant's machines, so it can name them. */
    machines: { id: string; name: string }[];
    messages: DesignMessage[];
    plant?: PlantContext;
  },
): Promise<ScenarioAnswer> {
  const { scenario, machines, messages, plant = {} } = options;
  const request = messages.at(-1);
  if (!request || request.role !== "user" || !request.text.trim()) {
    throw new Error("The last message has to be the user's description");
  }
  const reply = await ask({
    task: "describe-scenario",
    instruction:
      "You set up the conditions a factory's digital twin is tested against, from what the user describes. You only change settings the user's words call for, you say plainly when you assume a figure, and you never pretend the simulation can do something it cannot.",
    prompt: [
      "The scenario's settings, with their current values:",
      ...FIELDS.map(
        (spec) =>
          `- ${spec.field} (${spec.meaning}): ${show(currentValue(scenario, spec.field))}`,
      ),
      `- briefing (what the crew of agents running the shift is told, beyond the targets): ${show(scenario.briefing)}`,
      "",
      `The plant's machines: ${machines.map(({ name }) => name).join(", ") || "none listed"}.`,
      ...plantLines(plant),
      "",
      ...(messages.length > 1
        ? [
            "The conversation so far:",
            ...messages
              .slice(0, -1)
              .map(
                ({ role, text }) =>
                  `${role === "user" ? "User" : "You"}: ${text}`,
              ),
            "",
          ]
        : []),
      `The user now says:\n"""\n${request.text.trim()}\n"""`,
      "",
      'Answer with only JSON: {"reply": string, "changes": [{"field": string, "value": number | string | null, "reason": string}], "briefing": string | null, "notModelled": [string]}.',
      "changes sets the settings above that the user's words call for; use null to unset an optional setting. Shares are fractions (0.25 for 25%). Each reason is one short sentence; when you assume a figure (a temperature for a heatwave, how many parts a big order is), say so in the reason.",
      "briefing is a new briefing for the crew, two or three sentences on what matters this shift (priorities, what to watch), or null to keep the current one. Put in it only things that are true in the simulation.",
      "notModelled lists what the user described that these settings cannot express, such as an event at a set time, one machine out of action, or one machine failing more often. For a change to one machine's own figures, say it can be made in the twin step instead.",
      "reply says in one or two sentences what you understood. If the description is too vague to set anything, ask one short question in reply and leave changes empty.",
    ].join("\n"),
  });

  const parsed = Answer.parse(parseJsonReply(reply.text));
  const changes: ScenarioChange[] = [];
  for (const change of parsed.changes) {
    const spec = FIELDS.find(({ field }) => field === change.field);
    if (!spec || changes.some(({ field }) => field === spec.field)) continue;
    const value = fit(spec, change.value);
    if (value === undefined) continue;
    const current = currentValue(scenario, spec.field);
    if (value === (current ?? null)) continue;
    changes.push({ field: spec.field, value, reason: change.reason.trim() });
  }
  const briefing = parsed.briefing?.trim() || null;
  return {
    reply: parsed.reply.trim(),
    changes,
    briefing: briefing === scenario.briefing ? null : briefing,
    notModelled: (parsed.notModelled ?? [])
      .map((item) => item.trim())
      .filter(Boolean),
  };
}

const Suggestions = z.object({
  suggestions: z.array(z.string()).default([]),
});

/** How many starting points the scenario step offers. */
const SUGGESTION_COUNT = 3;

/**
 * A few scenarios worth testing this plant against, written as the user
 * would describe them ("A heatwave week with a rush order and two fitters
 * off sick"), for the scenario step to offer before anything is typed. Each
 * is one the settings above can express, so describeScenario can set it up.
 */
export async function suggestScenarios(
  ask: AskModel,
  options: {
    /** The plant's machines, so the suggestions name what is on its floor. */
    machines: { name: string; count?: number }[];
    /** How material moves through the floor, in the user's words. */
    process?: string;
    plant?: PlantContext;
  },
): Promise<string[]> {
  const { machines, process, plant = {} } = options;
  const reply = await ask({
    task: "suggest-scenarios",
    instruction:
      "You suggest realistic conditions to stress-test a factory's digital twin against, in the plain words a plant manager would use.",
    prompt: [
      `The plant's machines: ${
        machines
          .map(({ name, count }) => (count && count > 1 ? `${name} ×${count}` : name))
          .join(", ") || "none listed yet"
      }.`,
      ...(process?.trim()
        ? [`How material moves through the floor:\n"""\n${process.trim()}\n"""`]
        : []),
      ...plantLines(plant),
      "",
      "The simulation can change only these things for a shift:",
      ...FIELDS.filter(({ field }) => field !== "name").map(
        ({ field, meaning }) => `- ${field}: ${meaning}`,
      ),
      "",
      `Suggest ${SUGGESTION_COUNT} different scenarios this plant should be tested against. Each is one sentence of at most 15 words, as the user would type it, such as "A heatwave week with a rush order of 400 parts and two fitters off sick".`,
      "Make them differ: for example one about heat or demand, one about staff or maintenance, one about supply. Name this plant's own machines or products where it helps. Use only conditions the settings above can express: no events at a set time, and no single machine out of action.",
      'Answer with only JSON: {"suggestions": [string]}.',
    ].join("\n"),
  });
  const seen = new Set<string>();
  return Suggestions.parse(parseJsonReply(reply.text))
    .suggestions.map((text) => text.trim().replace(/^["']|["']$/g, ""))
    .filter((text) => {
      const key = text.toLowerCase();
      if (!text || text.length > 140 || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, SUGGESTION_COUNT);
}
