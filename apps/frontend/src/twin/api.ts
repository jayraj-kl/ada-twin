import type {
  Adjustment,
  FactoryGraph,
  GraphDiff,
  Kpis,
  Scenario,
  SimEvent,
} from "@repo/sim";
import type { DecisionRecord } from "./project";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

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
  const response = await fetch(`${API}/twin/locate`, {
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
  const response = await fetch(`${API}/twin/flow`, {
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
  const response = await fetch(`${API}/twin/flow/revise`, {
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
    }
  | { type: "decision"; record: DecisionRecord }
  /** What happened on the floor since the last line, while it runs. */
  | { type: "events"; events: SimEvent[] }
  | { type: "done"; kpis: Kpis; events: SimEvent[] }
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
  const response = await fetch(`${API}/run`, {
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
    await fetch(`${API}/twin/parameters`, { method: "POST", body: form }),
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
  const response = await fetch(`${API}/twin/costs`, {
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
  const response = await fetch(`${API}/run/redesign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ graph, kpis, scenario, messages }),
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
  const response = await fetch(`${API}/plant/explain`, {
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
  const response = await fetch(`${API}/plant/illustrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return unwrap(response);
}
