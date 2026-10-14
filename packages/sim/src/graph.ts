/** Where a parameter's value came from, so the UI can show what is assumed. */
export type Provenance =
  | { kind: "doc"; document: string; page?: number }
  | {
      kind: "web";
      url: string;
      /** The passage the value was taken from. */
      quote?: string;
      /** This exact model's datasheet, or a typical figure for its kind. */
      confidence: "datasheet" | "typical";
    }
  | { kind: "assumed" }
  | { kind: "user" };

export interface Param {
  value: number;
  unit: string;
  provenance: Provenance;
}

/** Where a node sits in the 3D world, and the panorama pixel it came from. */
export interface Anchor {
  position: [number, number, number];
  panoUv?: [number, number];
}

interface NodeBase {
  id: string;
  name: string;
  anchor?: Anchor;
}

/** Releases parts into the line. */
export interface SourceNode extends NodeBase {
  kind: "source";
  /** Mean seconds between parts. */
  interArrival: Param;
}

/** A machine, or several identical machines working in parallel. */
export interface StationNode extends NodeBase {
  kind: "station";
  /** Mean seconds to process one part. */
  cycleTime: Param;
  /** Spread of the cycle time as a share of its mean; 0 is perfectly regular. */
  cycleTimeVariation?: Param;
  /** Identical machines working in parallel. */
  units: Param;
  /** Mean seconds of running between failures; omit for a machine that never fails. */
  mtbf?: Param;
  /** Mean seconds to repair once a crew starts. */
  mttr?: Param;
  /** Share of finished parts scrapped, 0..1. */
  scrapRate?: Param;
}

/** Holds parts between stations, first in first out. */
export interface BufferNode extends NodeBase {
  kind: "buffer";
  /** Most parts it can hold. */
  capacity: Param;
}

/** Where finished parts leave. */
export interface SinkNode extends NodeBase {
  kind: "sink";
}

export type FactoryNode = SourceNode | StationNode | BufferNode | SinkNode;

/** Material flows `from` → `to`. */
export interface Edge {
  from: string;
  to: string;
  /** Relative share of parts taking this edge when a node has several; default 1. */
  share?: number;
}

export interface FactoryGraph {
  nodes: FactoryNode[];
  edges: Edge[];
}

export function param(
  value: number,
  unit: string,
  provenance: Provenance = { kind: "assumed" },
): Param {
  return { value, unit, provenance };
}

/** Problems that would make a graph impossible to simulate; empty when valid. */
export function validateGraph(graph: FactoryGraph): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (ids.has(node.id)) problems.push(`Duplicate node id "${node.id}"`);
    ids.add(node.id);
  }
  for (const edge of graph.edges) {
    for (const end of [edge.from, edge.to]) {
      if (!ids.has(end)) problems.push(`Edge refers to unknown node "${end}"`);
    }
  }
  for (const node of graph.nodes) {
    const outgoing = graph.edges.filter((edge) => edge.from === node.id);
    const incoming = graph.edges.filter((edge) => edge.to === node.id);
    if (node.kind !== "sink" && outgoing.length === 0) {
      problems.push(`"${node.id}" has nowhere to send parts`);
    }
    if (node.kind !== "source" && incoming.length === 0) {
      problems.push(`"${node.id}" never receives parts`);
    }
    if (node.kind === "sink" && outgoing.length > 0) {
      problems.push(`Sink "${node.id}" cannot send parts on`);
    }
    if (node.kind === "source" && incoming.length > 0) {
      problems.push(`Source "${node.id}" cannot receive parts`);
    }
  }
  if (!graph.nodes.some((node) => node.kind === "source")) {
    problems.push("The graph has no source");
  }
  if (!graph.nodes.some((node) => node.kind === "sink")) {
    problems.push("The graph has no sink");
  }
  return problems;
}
