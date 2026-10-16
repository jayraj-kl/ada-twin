import type { Adjustment, Kpis, SimEvent } from "@repo/sim";
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
