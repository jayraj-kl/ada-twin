import { z } from "zod";
import type { Machine } from "../machines";
import { type AskModel, type ModelFile, parseJsonReply } from "../model";
import {
  type PanoramaView,
  angleBetween,
  panoramaPoint,
  splitPanorama,
  viewDirection,
} from "../panorama-views";

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
type Entry = z.infer<typeof Reply>[number];

// Two views' points closer than this are taken to be the same unit.
const SAME_UNIT_DEGREES = 10;

const INSTRUCTION =
  "You locate industrial equipment in photographs for a factory digital twin. You only report what is clearly visible.";

function listMachines(machines: Machine[]): string[] {
  return machines.map(
    (machine) =>
      `- id "${machine.id}": ${machine.name}${machine.type ? ` (${machine.type})` : ""}, count ${machine.count ?? 1}${machine.notes ? `. ${machine.notes}` : ""}`,
  );
}

const ANSWER_FORMAT = [
  'Answer with a JSON array, one entry per machine: {"id": string, "points": [[y, x], ...], "note": string}.',
  "y and x are normalised to 0..1000 from the top-left of the image. Use an empty list when you cannot see the machine, and say in note why, or which units are hidden. Do not guess.",
];

async function askWhere(
  ask: AskModel,
  file: ModelFile,
  prompt: string[],
): Promise<Map<string, Entry>> {
  const reply = await ask({
    instruction: INSTRUCTION,
    files: [file],
    prompt: prompt.join("\n"),
  });
  return new Map(
    Reply.parse(parseJsonReply(reply.text)).map((entry) => [entry.id, entry]),
  );
}

/** The model's points that are on the image, as [y, x] shares. */
const onImage = (entry: Entry | undefined) =>
  (entry?.points ?? [])
    .filter((point) => point.every((value) => value >= 0 && value <= 1000))
    .map(([y, x]): [number, number] => [y / 1000, x / 1000]);

/**
 * Finds each listed machine in a 360° panorama. Machines the model cannot
 * see, or leaves out of its answer, come back unplaced for the user to pin by
 * hand; the model is never asked to invent a position.
 *
 * By default the panorama is cut into ordinary perspective views first, which
 * the model reads far better than the distorted panorama; `split: false`, or
 * an image that cannot be cut, sends the whole panorama instead.
 */
export async function locateMachines(
  ask: AskModel,
  panorama: ModelFile,
  machines: Machine[],
  { split = true }: { split?: boolean } = {},
): Promise<Placement[]> {
  if (machines.length === 0) return [];
  const views = split ? splitPanorama(panorama) : null;
  return views
    ? locateInViews(ask, views, machines)
    : locateInPanorama(ask, panorama, machines);
}

async function locateInPanorama(
  ask: AskModel,
  panorama: ModelFile,
  machines: Machine[],
): Promise<Placement[]> {
  const found = await askWhere(ask, panorama, [
    "This image is a 360° equirectangular panorama of a factory floor: its left and right edges meet, and straight lines appear curved.",
    "For each machine below, give one point per unit you can see, at the centre of that unit's visible body, and never more points than its count. A machine with count 5 should get 5 points if all five are visible, fewer if some are hidden.",
    "",
    ...listMachines(machines),
    "",
    ...ANSWER_FORMAT,
  ]);
  return machines.map((machine) => {
    const entry = found.get(machine.id);
    return {
      id: machine.id,
      points: onImage(entry)
        .slice(0, machine.count ?? 1)
        .map(([y, x]): [number, number] => [x, y]),
      note: entry ? entry.note : "Not mentioned in the model's answer",
    };
  });
}

/** One sighting of a unit in one view. */
interface Sighting {
  direction: [number, number, number];
  view: number;
  /** 1 at the view's centre, 0 at its edge, where units are often cut off. */
  weight: number;
  note?: string;
}

/** Sightings taken to be the same unit seen from overlapping views. */
interface Unit {
  sightings: Sighting[];
  direction: [number, number, number];
}

/**
 * Asks about each view on its own, then merges what the views saw: a unit in
 * the overlap of two views is reported by both, so sightings that point the
 * same way become one unit, and units seen by more views are trusted first.
 */
export async function locateInViews(
  ask: AskModel,
  views: PanoramaView[],
  machines: Machine[],
): Promise<Placement[]> {
  const answers = await Promise.all(
    views.map((view) =>
      askWhere(ask, view.file, [
        `This image is one of ${views.length} ordinary photos taken from the same spot on a factory floor, each looking a different way with a ${view.fov}° field of view. Neighbouring photos overlap, so a machine cut off at the edge of this one is seen whole in another.`,
        "For each machine below, give one point per unit whose body is in this photo, at the centre of that unit's visible body, and never more points than its count. Leave out units that are mostly outside the frame.",
        "",
        ...listMachines(machines),
        "",
        ...ANSWER_FORMAT,
      ]),
    ),
  );

  return machines.map((machine) => {
    const sightings = answers.flatMap((found, view) => {
      const entry = found.get(machine.id);
      return onImage(entry).map(([y, x]): Sighting => ({
        direction: viewDirection(views[view]!, x, y),
        view,
        weight: 1 - Math.max(Math.abs(2 * x - 1), Math.abs(2 * y - 1)),
        note: entry?.note,
      }));
    });

    // The clearest sightings first, so each unit is centred on its best view.
    const units: Unit[] = [];
    for (const sighting of sightings.sort((a, b) => b.weight - a.weight)) {
      const same = units.find(
        (unit) =>
          // Two points in one view are two units, however close.
          !unit.sightings.some(({ view }) => view === sighting.view) &&
          angleBetween(unit.direction, sighting.direction) < SAME_UNIT_DEGREES,
      );
      if (same) same.sightings.push(sighting);
      else units.push({ sightings: [sighting], direction: sighting.direction });
    }
    for (const unit of units) unit.direction = meanDirection(unit.sightings);

    const support = (unit: Unit) =>
      unit.sightings.length +
      unit.sightings.reduce((sum, { weight }) => sum + weight, 0) / 10;
    const kept = units
      .sort((a, b) => support(b) - support(a))
      .slice(0, machine.count ?? 1);
    const mentioned = answers.some((found) => found.has(machine.id));
    const best = kept[0]?.sightings[0];

    return {
      id: machine.id,
      points: kept.map((unit) => panoramaPoint(unit.direction)),
      note:
        best?.note ??
        answers.map((found) => found.get(machine.id)?.note).find(Boolean) ??
        (mentioned
          ? undefined
          : "Not mentioned in the model's answer for any view"),
    };
  });
}

function meanDirection(sightings: Sighting[]): [number, number, number] {
  const sum = [0, 0, 0];
  for (const { direction, weight } of sightings) {
    // Even an edge sighting counts for a little.
    for (let axis = 0; axis < 3; axis++) {
      sum[axis]! += direction[axis]! * (weight + 0.1);
    }
  }
  const length = Math.hypot(...sum);
  return sum.map((value) => value / length) as [number, number, number];
}
