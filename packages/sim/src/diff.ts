import type { FactoryGraph, Param } from "./graph";

/** One concrete change to a factory, as a report recommendation proposes it. */
export type GraphDiff =
  | { type: "add-units"; station: string; count: number }
  | { type: "resize-buffer"; buffer: string; capacity: number }
  | {
      type: "set-param";
      node: string;
      param:
        | "cycleTime"
        | "cycleTimeVariation"
        | "mtbf"
        | "mttr"
        | "scrapRate"
        | "interArrival";
      value: number;
    };

/** Returns a changed copy; the graph passed in is left untouched. */
export function applyDiffs(
  graph: FactoryGraph,
  diffs: GraphDiff[],
): FactoryGraph {
  const next = structuredClone(graph);
  const find = (id: string) => {
    const node = next.nodes.find((candidate) => candidate.id === id);
    if (!node) throw new Error(`No node "${id}" in the graph`);
    return node;
  };
  const set = (current: Param | undefined, value: number, unit: string) => ({
    value,
    unit: current?.unit ?? unit,
    // A proposed value is a decision, not something read from a document.
    provenance: { kind: "user" as const },
  });

  for (const diff of diffs) {
    if (diff.type === "add-units") {
      const node = find(diff.station);
      if (node.kind !== "station") {
        throw new Error(`"${diff.station}" is not a station`);
      }
      node.units = set(node.units, node.units.value + diff.count, "units");
    } else if (diff.type === "resize-buffer") {
      const node = find(diff.buffer);
      if (node.kind !== "buffer") {
        throw new Error(`"${diff.buffer}" is not a buffer`);
      }
      node.capacity = set(node.capacity, diff.capacity, "parts");
    } else {
      const node = find(diff.node);
      const fits =
        diff.param === "interArrival"
          ? node.kind === "source"
          : node.kind === "station" ||
            (node.kind === "support" &&
              (diff.param === "mtbf" || diff.param === "mttr"));
      if (!fits) {
        throw new Error(`"${diff.node}" has no ${diff.param}`);
      }
      const params = node as unknown as Record<string, Param | undefined>;
      params[diff.param] = set(
        params[diff.param],
        diff.value,
        diff.param === "scrapRate" || diff.param === "cycleTimeVariation"
          ? "share"
          : "s",
      );
    }
  }
  return next;
}
