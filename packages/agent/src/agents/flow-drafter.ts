import { z } from "zod";
import type { Machine } from "../machines";
import { type AskModel, type ModelFile, parseJsonReply } from "../model";

/** A node the flow needs that is not one of the user's machines. */
export interface FlowNode {
  id: string;
  kind: "source" | "buffer" | "sink";
  name: string;
}

/** A first guess at how material moves through the plant, for the user to correct. */
export interface FlowDraft {
  /** Suggested sources, buffers and sinks; machines are not repeated here. */
  nodes: FlowNode[];
  /** Links between machine ids and the ids of `nodes`. */
  edges: { from: string; to: string }[];
  note?: string;
}

const Reply = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string().min(1),
        kind: z.enum(["source", "buffer", "sink"]),
        name: z.string().min(1),
      }),
    )
    .default([]),
  edges: z.array(z.object({ from: z.string(), to: z.string() })).default([]),
  note: z.string().optional(),
});

/**
 * Drafts the material flow between the listed machines from the panorama and
 * the user's description of their process. Only the structure is drafted, no
 * numbers. Links the model gets wrong are dropped rather than repaired: the
 * user edits the draft anyway, and a missing link is easier to spot than a
 * wrong one.
 */
export async function draftFlow(
  ask: AskModel,
  panorama: ModelFile,
  machines: Machine[],
  description?: string,
): Promise<FlowDraft> {
  if (machines.length === 0) return { nodes: [], edges: [] };
  const reply = await ask({
    instruction:
      "You map how material moves through a factory for a digital twin. You rely on what the user tells you and on what is clearly visible, and you keep the flow as simple as the evidence allows.",
    files: [panorama],
    prompt: [
      "This image is a 360° equirectangular panorama of a factory floor.",
      description?.trim()
        ? `The user describes their process like this:\n"""\n${description.trim()}\n"""`
        : "The user gave no description of their process, so go by the machine names and the layout you can see.",
      "",
      "These are the machines on the floor. Each is a station in the flow and must appear in it exactly as given:",
      ...machines.map(
        (machine) =>
          `- id "${machine.id}": ${machine.name}${machine.type ? ` (${machine.type})` : ""}, count ${machine.count ?? 1}`,
      ),
      "",
      "Draft the material flow as a directed graph.",
      "- Add one source where material enters and one sink where it leaves, unless the description calls for more.",
      "- Add a buffer between two stations only where the description mentions one or you can see somewhere parts wait (a rack, a queue, a holding area).",
      "- Every machine needs something feeding it and somewhere to send parts. A source only sends; a sink only receives.",
      "- Do not add machines of your own.",
      "",
      'Answer with JSON: {"nodes": [{"id": string, "kind": "source" | "buffer" | "sink", "name": string}], "edges": [{"from": id, "to": id}], "note": string}.',
      "nodes lists only what you add; refer to machines by the ids above. Give short plain names, and use note for one sentence on what you were unsure of.",
    ].join("\n"),
  });

  const draft = Reply.parse(parseJsonReply(reply.text));
  const machineIds = new Set(machines.map(({ id }) => id));
  const nodes = draft.nodes.filter(
    (node, index) =>
      !machineIds.has(node.id) &&
      draft.nodes.findIndex(({ id }) => id === node.id) === index,
  );
  const kinds = new Map<string, string>([
    ...machines.map(({ id }): [string, string] => [id, "station"]),
    ...nodes.map(({ id, kind }): [string, string] => [id, kind]),
  ]);
  const seen = new Set<string>();
  const edges = draft.edges.filter(({ from, to }) => {
    const key = `${from}\n${to}`;
    const sound =
      from !== to &&
      kinds.has(from) &&
      kinds.has(to) &&
      kinds.get(from) !== "sink" &&
      kinds.get(to) !== "source" &&
      !seen.has(key);
    seen.add(key);
    return sound;
  });
  return { nodes, edges, note: draft.note };
}
