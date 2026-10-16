import { z } from "zod";
import type { Machine } from "../machines";
import { type AskModel, type ModelFile, parseJsonReply } from "../model";

/** A node the flow needs that is not one of the user's machines. */
export interface FlowNode {
  id: string;
  kind: "source" | "buffer" | "sink";
  name: string;
  /** Seconds between parts for a source, parts held for a buffer, if known. */
  value?: number;
}

/** A first guess at how material moves through the plant, for the user to correct. */
export interface FlowDraft {
  /** Suggested sources, buffers and sinks; machines are not repeated here. */
  nodes: FlowNode[];
  /** Links between machine ids and the ids of `nodes`. */
  edges: { from: string; to: string }[];
  /**
   * Machines that are support equipment, which parts never pass through:
   * the ones the user marked, and any the model judged to be.
   */
  support: string[];
  /** From a support machine to a station or source that cannot run without it. */
  needs: { from: string; to: string }[];
  note?: string;
}

const Link = z.object({ from: z.string(), to: z.string() });

const Reply = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string().min(1),
        kind: z.enum(["source", "buffer", "sink"]),
        name: z.string().min(1),
        value: z.number().positive().optional().catch(undefined),
      }),
    )
    .default([]),
  edges: z.array(Link).default([]),
  support: z.array(z.string()).default([]),
  needs: z.array(Link).default([]),
  note: z.string().optional(),
});

/** Keeps the first of each link `sound` accepts. */
function keepSound(
  links: { from: string; to: string }[],
  sound: (link: { from: string; to: string }) => boolean,
) {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = `${link.from}\n${link.to}`;
    const keep = sound(link) && !seen.has(key);
    seen.add(key);
    return keep;
  });
}

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
  if (machines.length === 0) {
    return { nodes: [], edges: [], support: [], needs: [] };
  }
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
      "These are the machines on the floor:",
      ...machines.map(
        (machine) =>
          `- id "${machine.id}": ${machine.name}${machine.type ? ` (${machine.type})` : ""}, count ${machine.count ?? 1}${machine.auxiliary ? ", marked by the user as support equipment" : ""}`,
      ),
      "",
      "Each machine is either a station that parts pass through, or support equipment that parts never pass through but that stations cannot run without, such as control cabinets, gas regulators or compressors.",
      "",
      "Draft the material flow as a directed graph.",
      "- Add one source where material enters and one sink where it leaves, unless the description calls for more.",
      "- Add a buffer between two stations only where the description mentions one or you can see somewhere parts wait (a rack, a queue, a holding area).",
      "- Every station needs something feeding it and somewhere to send parts. A source only sends; a sink only receives.",
      "- List support equipment in support, including every machine the user marked, and keep it out of edges. For each, add a needs entry to every station or source that stops when it fails.",
      "- Do not add machines of your own.",
      "",
      'Answer with JSON: {"nodes": [{"id": string, "kind": "source" | "buffer" | "sink", "name": string}], "edges": [{"from": id, "to": id}], "support": [machine id], "needs": [{"from": support machine id, "to": station or source id}], "note": string}.',
      "nodes lists only what you add; refer to machines by the ids above. Give short plain names, and use note for one sentence on what you were unsure of.",
    ].join("\n"),
  });

  return soundFlow(machines, Reply.parse(parseJsonReply(reply.text)));
}

/**
 * Keeps what the model got right: new nodes that do not clash with machines,
 * support equipment off the parts path, and only links that can exist.
 */
function soundFlow(
  machines: Machine[],
  draft: z.infer<typeof Reply>,
): FlowDraft {
  const machineIds = new Set(machines.map(({ id }) => id));
  const nodes = draft.nodes
    .filter(
      (node, index) =>
        !machineIds.has(node.id) &&
        draft.nodes.findIndex(({ id }) => id === node.id) === index,
    )
    // A sink holds and paces nothing, so it has no value.
    .map(({ value, ...node }) =>
      value === undefined || node.kind === "sink" ? node : { ...node, value },
    );
  // The user's marking stands whatever the model says.
  const support = new Set([
    ...machines.filter(({ auxiliary }) => auxiliary).map(({ id }) => id),
    ...draft.support.filter((id) => machineIds.has(id)),
  ]);
  const kinds = new Map<string, string>([
    ...machines.map(({ id }): [string, string] => [
      id,
      support.has(id) ? "support" : "station",
    ]),
    ...nodes.map(({ id, kind }): [string, string] => [id, kind]),
  ]);

  const needs = keepSound(
    draft.needs,
    ({ from, to }) =>
      kinds.get(from) === "support" &&
      (kinds.get(to) === "station" || kinds.get(to) === "source"),
  );
  const edges = keepSound(draft.edges, ({ from, to }) => {
    const a = kinds.get(from);
    const b = kinds.get(to);
    return (
      from !== to &&
      a !== undefined &&
      b !== undefined &&
      a !== "support" &&
      b !== "support" &&
      a !== "sink" &&
      b !== "source"
    );
  });
  return { nodes, edges, support: [...support], needs, note: draft.note };
}

/** One turn of the conversation about the flow. */
export interface FlowMessage {
  role: "user" | "assistant";
  text: string;
}

/** The flow as it stands, for the model to change. */
export interface CurrentFlow {
  nodes: FlowNode[];
  edges: { from: string; to: string }[];
  needs: { from: string; to: string }[];
}

export interface FlowRevision extends FlowDraft {
  /** What was changed, or a question back when the request was unclear. */
  reply: string;
}

const Revision = Reply.extend({ reply: z.string().default("") });

/**
 * Changes the flow the way the user asks in plain words, keeping the rest of
 * it as it is. Earlier turns are sent too, so "and after that" or "undo the
 * buffer" make sense. The same checks as a draft apply to the answer.
 */
export async function reviseFlow(
  ask: AskModel,
  panorama: ModelFile,
  machines: Machine[],
  current: CurrentFlow,
  messages: FlowMessage[],
  description?: string,
): Promise<FlowRevision> {
  const request = messages.at(-1);
  if (!request || request.role !== "user" || !request.text.trim()) {
    throw new Error("The last message has to be the user's request");
  }
  const reply = await ask({
    instruction:
      "You edit the material flow of a factory's digital twin on the user's instructions. The user knows their plant: what they say overrides the photo and any earlier draft. You change only what they ask for.",
    files: [panorama],
    prompt: [
      "This image is a 360° equirectangular panorama of the factory floor.",
      description?.trim()
        ? `The user described their process like this:\n"""\n${description.trim()}\n"""`
        : "",
      "",
      "These are the machines on the floor:",
      ...machines.map(
        (machine) =>
          `- id "${machine.id}": ${machine.name}${machine.type ? ` (${machine.type})` : ""}, count ${machine.count ?? 1}${machine.auxiliary ? ", support equipment" : ""}`,
      ),
      "",
      "The flow as it stands, as JSON:",
      JSON.stringify(current),
      "",
      ...(messages.length > 1
        ? [
            "The conversation so far:",
            ...messages
              .slice(0, -1)
              .map(({ role, text }) => `${role === "user" ? "User" : "You"}: ${text}`),
            "",
          ]
        : []),
      `The user now asks:\n"""\n${request.text.trim()}\n"""`,
      "",
      "Apply the request to the flow.",
      "- Keep every node, link and needs entry the request does not touch exactly as it is, with the same ids.",
      "- You may add, rename or remove sources, buffers and sinks, and set their value: seconds between parts for a source, parts held for a buffer. Give new nodes new ids.",
      "- Machines are fixed: never add, rename or remove one. Make a machine support equipment only if the user asks. You cannot turn support equipment back into a station: if asked, say they can untick Auxiliary on that machine.",
      "- Support equipment never handles parts: keep it out of edges and link it with needs entries to the stations or sources that stop when it fails.",
      "- A source only sends, a sink only receives.",
      "- If the request is unclear or would break these rules, leave the flow unchanged and ask one short question in reply.",
      "",
      'Answer with JSON: {"nodes": [{"id": string, "kind": "source" | "buffer" | "sink", "name": string, "value"?: number}], "edges": [{"from": id, "to": id}], "support": [machine id], "needs": [{"from": support machine id, "to": station or source id}], "reply": string}.',
      "nodes, edges, support and needs are the whole flow after the change, not only what changed. reply is one or two plain sentences to the user on what you changed, or your question.",
    ]
      .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
      .join("\n"),
  });

  const revision = Revision.parse(parseJsonReply(reply.text));
  return {
    ...soundFlow(machines, revision),
    note: undefined,
    reply: revision.reply.trim() || "Done.",
  };
}
