import type { FactoryGraph, Param } from "./graph";

/** One concrete change to a factory, as a report recommendation proposes it. */
export type GraphDiff =
  | { type: "add-units"; station: string; count: number }
  | { type: "resize-buffer"; buffer: string; capacity: number }
  /** Standby units for support equipment, which cover for a unit that is down. */
  | { type: "add-spare"; support: string; count: number }
  /** A new buffer on the link from `from` to `to`, which it splits in two. */
  | {
      type: "insert-buffer";
      id: string;
      name: string;
      from: string;
      to: string;
      capacity: number;
    }
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
    } else if (diff.type === "add-spare") {
      const node = find(diff.support);
      if (node.kind !== "support") {
        throw new Error(`"${diff.support}" is not support equipment`);
      }
      node.units = set(node.units, node.units.value + diff.count, "units");
      node.spares = set(
        node.spares,
        (node.spares?.value ?? 0) + diff.count,
        "units",
      );
    } else if (diff.type === "insert-buffer") {
      if (next.nodes.some(({ id }) => id === diff.id)) {
        throw new Error(`There is already a node "${diff.id}"`);
      }
      const link = next.edges.findIndex(
        ({ from, to }) => from === diff.from && to === diff.to,
      );
      if (link < 0) {
        throw new Error(`No link from "${diff.from}" to "${diff.to}"`);
      }
      const { share } = next.edges[link]!;
      next.nodes.push({
        id: diff.id,
        kind: "buffer",
        name: diff.name,
        capacity: set(undefined, diff.capacity, "parts"),
      });
      next.edges.splice(
        link,
        1,
        { from: diff.from, to: diff.id, ...(share === undefined ? {} : { share }) },
        { from: diff.id, to: diff.to },
      );
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
