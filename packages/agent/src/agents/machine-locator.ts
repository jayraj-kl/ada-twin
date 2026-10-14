import { z } from "zod";
import type { Machine } from "../machines";
import { type AskModel, type ModelFile, parseJsonReply } from "../model";

/** Where a machine's units were found in the panorama, if any were. */
export interface Placement {
  id: string;
  points: [number, number][];
  note?: string;
}

// Gemini's convention for image coordinates: [y, x], each 0..1000.
const Reply = z.array(
  z.object({
    id: z.string(),
    points: z.array(z.tuple([z.number(), z.number()])).nullish(),
    note: z.string().optional(),
  }),
);

/**
 * Finds each listed machine in a 360° panorama. Machines the model cannot
 * see, or leaves out of its answer, come back unplaced for the user to pin by
 * hand; the model is never asked to invent a position.
 */
export async function locateMachines(
  ask: AskModel,
  panorama: ModelFile,
  machines: Machine[],
): Promise<Placement[]> {
  if (machines.length === 0) return [];
  const reply = await ask({
    instruction:
      "You locate industrial equipment in photographs for a factory digital twin. You only report what is clearly visible.",
    files: [panorama],
    prompt: [
      "This image is a 360° equirectangular panorama of a factory floor: its left and right edges meet, and straight lines appear curved.",
      "For each machine below, give one point per unit you can see, at the centre of that unit's visible body, and never more points than its count. A machine with count 5 should get 5 points if all five are visible, fewer if some are hidden.",
      "",
      ...machines.map(
        (machine) =>
          `- id "${machine.id}": ${machine.name}${machine.type ? ` (${machine.type})` : ""}, count ${machine.count ?? 1}${machine.notes ? `. ${machine.notes}` : ""}`,
      ),
      "",
      'Answer with a JSON array, one entry per machine: {"id": string, "points": [[y, x], ...], "note": string}.',
      "y and x are normalised to 0..1000 from the top-left of the image. Use an empty list when you cannot see the machine, and say in note why, or which units are hidden. Do not guess.",
    ].join("\n"),
  });

  const found = new Map(
    Reply.parse(parseJsonReply(reply.text)).map((entry) => [entry.id, entry]),
  );
  return machines.map((machine) => {
    const entry = found.get(machine.id);
    const points = (entry?.points ?? [])
      .filter((point) => point.every((value) => value >= 0 && value <= 1000))
      .slice(0, machine.count ?? 1)
      .map(([y, x]): [number, number] => [x / 1000, y / 1000]);
    return {
      id: machine.id,
      points,
      note: entry ? entry.note : "Not mentioned in the model's answer",
    };
  });
}
