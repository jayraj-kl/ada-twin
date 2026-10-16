import { type FactoryNode, param, validateGraph } from "@repo/sim";

export const PROCESS_KEY = "twin-process";
export const FLOW_KEY = "twin-flow";

export type ExtraKind = "source" | "buffer" | "sink";

/** A node of the flow that is not one of the listed machines. */
export interface ExtraNode {
  id: string;
  kind: ExtraKind;
  name: string;
  /** Seconds between parts for a source, parts held for a buffer. */
  value?: number;
  /** Proposed by the AI draft and not yet touched by the user. */
  suggested?: boolean;
}

export interface FlowLink {
  from: string;
  to: string;
}

/**
 * The material flow; machines join it by their id, as stations, or as
 * support nodes when they are auxiliary.
 */
export interface Flow {
  extras: ExtraNode[];
  links: FlowLink[];
  /**
   * From an auxiliary machine to a machine or source that cannot run without
   * it. Missing from flows saved before auxiliary machines existed.
   */
  needs?: FlowLink[];
  /** Saved by an early version; read as `needs` and never written. */
  monitors?: FlowLink[];
  positions: Record<string, { x: number; y: number }>;
}

export const EMPTY_FLOW: Flow = {
  extras: [],
  links: [],
  needs: [],
  positions: {},
};

/** Every node the diagram shows: the machines, then the extras. */
export interface FlowMember {
  id: string;
  kind: ExtraKind | "station" | "support";
  name: string;
}

export const KIND_LABELS: Record<FlowMember["kind"], string> = {
  source: "Source",
  station: "Machine",
  support: "Auxiliary",
  buffer: "Buffer",
  sink: "Sink",
};

// Assumed until the user sets them; the AI drafts structure, not numbers.
export const EXTRA_DEFAULTS = {
  source: { value: 90, label: "Seconds between parts" },
  buffer: { value: 6, label: "Parts it can hold" },
} as const;

const COLUMN_PX = 220;
const ROW_PX = 110;

/**
 * Places nodes top to bottom in flow order: each node sits one row below the
 * furthest node that feeds it, and nodes sharing a row are spread sideways.
 */
export function layoutFlow(
  members: FlowMember[],
  links: FlowLink[],
  needs: FlowLink[] = [],
): Flow["positions"] {
  const row = new Map(members.map(({ id }) => [id, 0]));
  // Each pass pushes nodes below their feeders; the pass limit stops a loop
  // in the flow from pushing them down forever.
  for (let pass = 0; pass < members.length; pass++) {
    let moved = false;
    for (const { from, to } of links) {
      const above = row.get(from);
      const below = row.get(to);
      if (above === undefined || below === undefined) continue;
      if (below < above + 1) {
        row.set(to, above + 1);
        moved = true;
      }
    }
    if (!moved) break;
  }
  // An auxiliary machine sits beside the first thing that needs it.
  for (const { from, to } of [...needs].reverse()) {
    const beside = row.get(to);
    if (beside !== undefined && row.has(from)) row.set(from, beside);
  }

  const rows = new Map<number, string[]>();
  for (const { id } of members) {
    const index = row.get(id)!;
    rows.set(index, [...(rows.get(index) ?? []), id]);
  }
  const positions: Flow["positions"] = {};
  for (const [index, ids] of rows) {
    ids.forEach((id, column) => {
      positions[id] = {
        x: (column - (ids.length - 1) / 2) * COLUMN_PX,
        y: index * ROW_PX,
      };
    });
  }
  return positions;
}

/** Where a node added after the last layout goes: below everything else. */
export function freePosition(positions: Flow["positions"]) {
  const lowest = Math.max(-ROW_PX, ...Object.values(positions).map((p) => p.y));
  return { x: 0, y: lowest + ROW_PX };
}

/**
 * What stops this flow from being simulated, in the user's own names. Only
 * the structure is checked here, so station numbers are placeholders.
 */
export function flowProblems(
  members: FlowMember[],
  links: FlowLink[],
  needs: FlowLink[] = [],
) {
  if (members.length === 0) return [];
  const placeholder = param(1, "s");
  const nodes = members.map(({ id, kind, name }): FactoryNode => {
    if (kind === "source") return { id, kind, name, interArrival: placeholder };
    if (kind === "buffer") return { id, kind, name, capacity: placeholder };
    if (kind === "sink") return { id, kind, name };
    if (kind === "support") return { id, kind, name, units: placeholder };
    return { id, kind, name, cycleTime: placeholder, units: placeholder };
  });
  const names = new Map(members.map(({ id, name }) => [id, name]));
  return validateGraph({
    nodes,
    edges: links,
    dependencies: needs.map(({ from, to }) => ({
      support: from,
      neededBy: to,
    })),
  }).map((problem) =>
    problem
      .replace(/^(Sink|Source) /, "")
      .replace(/"([^"]+)"/g, (quoted, id: string) => names.get(id) ?? quoted)
      .replace("The graph has no", "The flow has no")
      .replace(
        "is support equipment and handles no parts",
        "is auxiliary, so it cannot be linked to parts",
      )
      .replace("but is not support equipment", "but is not auxiliary")
      .replace("by a station or source", "by a machine or source"),
  );
}

/** What does not stop a simulation but is probably not what the user meant. */
export function flowWarnings(members: FlowMember[], needs: FlowLink[] = []) {
  return members
    .filter(
      ({ id, kind }) =>
        kind === "support" && !needs.some(({ from }) => from === id),
    )
    .map(
      ({ name }) =>
        `${name} is needed by nothing, so its failures only cost crew time`,
    );
}
