import type {
  Adjustment,
  FactoryGraph,
  GraphDiff,
  Kpis,
  Playbook,
  Scenario,
  SimEvent,
} from "@repo/sim";
import { API, modelHeaders } from "@/lib/models";
import type { DecisionRecord } from "./project";

/** A request to the API, with the models picked in this browser. */
function apiFetch(path: string, init: RequestInit = {}) {
  return fetch(`${API}${path}`, {
    ...init,
    headers: { ...modelHeaders(), ...(init.headers as Record<string, string>) },
  });
}

// These mirror the shapes the API's /twin routes send and accept.
export interface Machine {
  id: string;
  name: string;
  type?: string;
  manufacturer?: string;
  model?: string;
  count?: number;
  auxiliary?: boolean;
}

export type Provenance =
  | { kind: "doc"; document: string; page?: number }
  | {
      kind: "web";
      url: string;
      quote?: string;
      confidence: "datasheet" | "typical";
    }
  | { kind: "assumed" }
  | { kind: "user" };

export interface Param {
  value: number;
  unit: string;
  provenance: Provenance;
}

export interface Placement {
  id: string;
  /** One position per unit seen, as shares of the image; empty if unseen. */
  points: [number, number][];
  note?: string;
}

async function unwrap<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error ?? `The API answered HTTP ${response.status}`);
  }
  return body as T;
}

export async function locate(
  panoramaUrl: string,
  machines: Machine[],
): Promise<Placement[]> {
  const response = await apiFetch(`/twin/locate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ panoramaUrl, machines }),
  });
  return (await unwrap<{ placements: Placement[] }>(response)).placements;
}

export interface FlowDraft {
  nodes: { id: string; kind: "source" | "buffer" | "sink"; name: string }[];
  edges: { from: string; to: string }[];
  /** Machines that are auxiliary: the user's, and any the AI judged to be. */
  support: string[];
  /** From an auxiliary machine to a machine or source that needs it. */
  needs: { from: string; to: string }[];
  note?: string;
}

export async function draftFlow(
  panoramaUrl: string,
  machines: Machine[],
  description: string,
): Promise<FlowDraft> {
  const response = await apiFetch(`/twin/flow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ panoramaUrl, machines, description }),
  });
  return unwrap(response);
}

export interface FlowRevision extends FlowDraft {
  nodes: (FlowDraft["nodes"][number] & { value?: number })[];
  /** What was changed, or a question back. */
  reply: string;
}

/** Changes the flow the way the user asks, keeping the rest of it. */
export async function reviseFlow(
  panoramaUrl: string,
  machines: Machine[],
  description: string,
  current: {
    nodes: FlowRevision["nodes"];
    edges: { from: string; to: string }[];
    needs: { from: string; to: string }[];
  },
  messages: { role: "user" | "assistant"; text: string }[],
): Promise<FlowRevision> {
  const response = await apiFetch(`/twin/flow/revise`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      panoramaUrl,
      machines,
      description,
      current,
      messages,
    }),
  });
  return unwrap(response);
}

/** One line of the /run route's answer. */
export type RunLine =
  | {
      type: "start";
      horizon: number;
      maintenanceCrews: number;
      adjustments: Adjustment[];
      baseline: Kpis;
      /** Standard rules on each day averaged; the first is `baseline`. */
      days: Kpis[];
    }
  | { type: "decision"; record: DecisionRecord }
  /** What happened on the floor since the last line, while it runs. */
  | { type: "events"; events: SimEvent[] }
  | { type: "done"; kpis: Kpis; events: SimEvent[] }
  /** After `done`, with agents: their way of working as fixed rules. */
  | { type: "playbook"; playbook: Playbook | null; problem?: string }
  | { type: "error"; message: string };

/**
 * Runs a shift, calling `onLine` as each part of the answer arrives: the
 * baseline first, each agent decision as it is made, then the finished run.
 */
export async function streamRun(
  body: unknown,
  onLine: (line: RunLine) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await apiFetch(`/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok || !response.body) {
    const failure = await response.json().catch(() => null);
    throw new Error(
      failure?.error ?? `The API answered HTTP ${response.status}`,
    );
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const lines = (pending + value).split("\n");
    pending = lines.pop()!;
    for (const line of lines) {
      if (line.trim()) onLine(JSON.parse(line) as RunLine);
    }
  }
  if (pending.trim()) onLine(JSON.parse(pending) as RunLine);
}

export async function findParameters(
  machine: Machine,
  documents: File[],
): Promise<{ params: Record<string, Param>; assumed: string[] }> {
  const form = new FormData();
  form.set("machine", JSON.stringify(machine));
  for (const document of documents) form.append("documents", document);
  return unwrap(
    await apiFetch(`/twin/parameters`, { method: "POST", body: form }),
  );
}

export interface CostRange {
  low: number;
  high: number;
}

/** What a recommended change would cost, as the API found it on the web. */
export interface CostEstimate {
  id: string;
  currency: string;
  /** Paid once; null if there is no such cost. */
  oneOff: CostRange | null;
  /** Paid every year; null if there is no such cost. */
  yearly: CostRange | null;
  basis: string;
  /** Empty when the range is only the model's estimate. */
  sources: { url: string; title?: string }[];
}

export async function estimateCosts(
  changes: { id: string; title: string; detail: string; machine?: Machine }[],
  currency: string,
): Promise<CostEstimate[]> {
  const response = await apiFetch(`/twin/costs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ changes, currency }),
  });
  return (await unwrap<{ estimates: CostEstimate[] }>(response)).estimates;
}

/** A change the design chat proposes, in the shape the report measures. */
export interface DesignedChange {
  id: string;
  title: string;
  detail: string;
  diffs: GraphDiff[];
  extraCrews: number;
}

/** Turns a request in plain words into changes to the redesigned plant. */
export async function designChanges(
  graph: FactoryGraph,
  kpis: Kpis | undefined,
  scenario: Scenario,
  messages: { role: "user" | "assistant"; text: string }[],
): Promise<{ reply: string; changes: DesignedChange[] }> {
  const response = await apiFetch(`/run/redesign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ graph, kpis, scenario, messages }),
  });
  return unwrap(response);
}

/** How one station or support spent the shift, as shares of its time. */
export interface DigestLine {
  id: string;
  working?: number;
  blocked?: number;
  /** Up with nothing to do: starved of parts. */
  idle?: number;
  down?: number;
  /** Stopped by support equipment it needs. */
  stopped?: number;
  failures?: number;
}

/** A run boiled down to what the equipment scout reads. */
export interface RunDigest {
  shipped: number;
  range?: { min: number; max: number };
  days: number;
  bottleneck?: string;
  stations: DigestLine[];
  supports: DigestLine[];
  decisions?: { total: number; fallbacks: number };
}

export type ScoutKind = "new-station" | "new-support" | "spares";

/** New equipment, or spares on the shelf, that the run says would help. */
export interface ScoutedChange extends DesignedChange {
  kind: ScoutKind;
  /** The problem it answers, with the run's numbers. */
  problem: string;
  sources: { url: string; title?: string }[];
}

/** Asks the AI what equipment the plant is missing, from a run. */
export async function scoutEquipment(body: {
  graph: FactoryGraph;
  digest: RunDigest;
  scenario: Scenario;
  /** Titles already suggested or kept, not to repeat. */
  known: string[];
}): Promise<{ suggestions: ScoutedChange[]; dropped: string[] }> {
  const response = await apiFetch(`/run/scout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return unwrap(response);
}

/** The written part of the applied-changes report. */
export async function explainChanges(body: {
  scenario: Scenario;
  before: number;
  after: number;
  bottleneck?: string;
  changes: {
    id: string;
    title: string;
    detail: string;
    tier: string;
    marginal: number;
    solo: number;
    cost?: string;
  }[];
}): Promise<{ summary: string; paragraphs: Record<string, string> }> {
  const response = await apiFetch(`/plant/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return unwrap(response);
}

export interface InlineImage {
  mimeType: string;
  /** Base64. */
  data: string;
}

/** One image Nano Banana drew, with the turn that revises it next time. */
export type Illustration =
  | { image: InlineImage | null; text: string; turn: unknown }
  | { error: string };

/** Draws the redesign into a photo of the plant, `count` times over. */
export async function illustrate(body: {
  view: InlineImage;
  subject: string;
  changes: string[];
  previous?: unknown;
  notes: string[];
  message: string;
  count: number;
}): Promise<{
  check: { outside: boolean; note: string } | null;
  results: Illustration[];
}> {
  const response = await apiFetch(`/plant/illustrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return unwrap(response);
}

/** A scenario setting the scenario assistant can change. */
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

/** What the scenario assistant made of a description; nothing is applied yet. */
export interface ScenarioAnswer {
  reply: string;
  changes: {
    field: ScenarioField;
    /** Null unsets the setting. */
    value: number | string | null;
    reason: string;
  }[];
  /** A new crew briefing, or null to keep the current one. */
  briefing: string | null;
  /** What was described that the simulation cannot model yet. */
  notModelled: string[];
}

export async function describeScenario(
  scenario: Scenario,
  machines: { id: string; name: string }[],
  messages: { role: "user" | "assistant"; text: string }[],
): Promise<ScenarioAnswer> {
  const response = await apiFetch(`/twin/scenario`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario, machines, messages }),
  });
  return unwrap(response);
}
