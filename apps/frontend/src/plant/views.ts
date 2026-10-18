import type { FactoryGraph, GraphDiff } from "@repo/sim";
import type { Point } from "@/twin/project";
import type { Change } from "@/twin/recommend";
import type { AppliedRedesign } from "./rank";

/** A perspective photo cut out of the panorama, centred on what changed. */
export interface PlantView {
  id: string;
  /** Short, for its tab. */
  label: string;
  /** What sits in the middle, for the model. */
  subject: string;
  /** The applied changes it shows, one line each. */
  lines: string[];
  changeIds: string[];
  /** The first request, written from the changes. */
  prompt: string;
  /** Degrees: right of the panorama's centre, above the horizon, across. */
  yaw: number;
  pitch: number;
  fov: number;
}

// 16:9, the shape Nano Banana is asked to draw.
export const VIEW_WIDTH = 1376;
export const VIEW_HEIGHT = 774;
const MIN_FOV = 60;
const MAX_FOV = 100;

type Machine = AppliedRedesign["machines"][number];
type Direction = [number, number, number];

/**
 * The direction of a pin from the camera, Y up. Pins are in the splat's
 * Y-down frame, and the panorama was shot from the world origin.
 */
function directionOf([x, y, z]: Point): Direction {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, -y / length, z / length];
}

const degrees = (radians: number) => (radians * 180) / Math.PI;

/** Yaw, pitch and a field of view that holds every pin with room around it. */
function frame(pins: Point[]) {
  const directions = pins.map(directionOf);
  const sum = directions.reduce(
    (total, direction) => total.map((value, axis) => value + direction[axis]!) as Direction,
    [0, 0, 0] as Direction,
  );
  const length = Math.hypot(...sum) || 1;
  const centre = sum.map((value) => value / length) as Direction;
  const widest = Math.max(
    0,
    ...directions.map((direction) =>
      degrees(
        Math.acos(
          Math.min(1, direction.reduce((dot, value, axis) => dot + value * centre[axis]!, 0)),
        ),
      ),
    ),
  );
  return {
    yaw: degrees(Math.atan2(centre[0], centre[2])),
    pitch: degrees(Math.atan2(centre[1], Math.hypot(centre[0], centre[2]))),
    fov: Math.min(MAX_FOV, Math.max(MIN_FOV, widest * 2.6 + 30)),
  };
}

const units = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * The photos worth drawing: one per machine a change adds to, and one per
 * link a new buffer goes on. Parameter changes and crews have nothing to
 * see, and a machine without a pin has nowhere to be found.
 */
export function viewsFor(
  changes: Change[],
  machines: Machine[],
  graph: FactoryGraph,
): { views: PlantView[]; unseen: { change: Change; reason: string }[] } {
  const byId = new Map(machines.map((machine) => [machine.id, machine]));
  const nameOf = (id: string) =>
    byId.get(id)?.name ?? graph.nodes.find((node) => node.id === id)?.name ?? id;
  const pinned = (id: string) => (byId.get(id)?.pins?.length ?? 0) > 0;
  const views = new Map<string, Omit<PlantView, "yaw" | "pitch" | "fov"> & { pins: Point[] }>();
  const unseen: { change: Change; reason: string }[] = [];

  const add = (
    key: string,
    base: { label: string; subject: string; pins: Point[] },
    change: Change,
    ask: string,
  ) => {
    const view = views.get(key) ?? {
      id: key,
      ...base,
      lines: [],
      changeIds: [],
      prompt: "",
    };
    if (!view.changeIds.includes(change.id)) {
      view.changeIds.push(change.id);
      view.lines.push(change.detail ? `${change.title}: ${change.detail}` : change.title);
    }
    view.prompt = `${view.prompt} ${ask}`.trim();
    views.set(key, view);
  };

  const machineView = (id: string) => {
    const machine = byId.get(id)!;
    const count = machine.count ?? 1;
    return {
      label: machine.name,
      subject: `${machine.name} (${units(count, "unit")})`,
      pins: machine.pins!,
    };
  };

  const ask = (diff: GraphDiff): [string, string] | string => {
    switch (diff.type) {
      case "add-units": {
        if (!pinned(diff.station)) return `${nameOf(diff.station)} has no pin in the world`;
        const count = byId.get(diff.station)?.count ?? 1;
        return [
          `node:${diff.station}`,
          `Add ${diff.count === 1 ? "one more" : `${diff.count} more`} ${nameOf(diff.station)}, identical to the existing ${count === 1 ? "one" : count}, standing beside ${count === 1 ? "it" : "them"} and connected the same way.`,
        ];
      }
      case "add-spare":
        if (!pinned(diff.support)) return `${nameOf(diff.support)} has no pin in the world`;
        return [
          `node:${diff.support}`,
          `Add ${diff.count === 1 ? "a standby" : `${diff.count} standby`} ${nameOf(diff.support)}, the same model as the existing one, installed next to it and connected in parallel.`,
        ];
      case "insert-buffer": {
        const ends = [diff.from, diff.to].filter(pinned);
        if (ends.length === 0) return "Neither end of the link has a pin in the world";
        return [
          `link:${diff.from}:${diff.to}`,
          `Add a ${diff.name.toLowerCase()} holding about ${diff.capacity} parts between ${nameOf(diff.from)} and ${nameOf(diff.to)}, sized and styled to fit the plant.`,
        ];
      }
      case "insert-station": {
        const ends = [diff.from, diff.to].filter(pinned);
        if (ends.length === 0) return "Neither machine beside it has a pin in the world";
        return [
          `link:${diff.from}:${diff.to}`,
          `Add ${diff.units === 1 ? "a" : diff.units} new ${diff.name.toLowerCase()}${diff.units === 1 ? "" : "s"} between ${nameOf(diff.from)} and ${nameOf(diff.to)}: industrial equipment of that kind, at a realistic size, piped and wired in like its neighbours.`,
        ];
      }
      case "add-support": {
        const served = diff.neededBy.filter(pinned);
        if (served.length === 0) return "Nothing it serves has a pin in the world";
        return [
          `node:${served[0]}`,
          `Add a new ${diff.name.toLowerCase()} next to ${nameOf(served[0]!)}, connected to it: industrial equipment of that kind, at a realistic size.`,
        ];
      }
      case "resize-buffer": {
        const fed = graph.edges.find(({ from }) => from === diff.buffer)?.to;
        if (!fed || !pinned(fed)) return "The buffer has no machine with a pin next to it";
        return [
          `node:${fed}`,
          `Make the ${nameOf(diff.buffer).toLowerCase()} in front of ${nameOf(fed)} large enough for about ${diff.capacity} parts.`,
        ];
      }
      default:
        return "A change to how it runs, not to what you can see";
    }
  };

  for (const change of changes) {
    const reasons: string[] = [];
    let shown = false;
    for (const diff of change.diffs) {
      const answer = ask(diff);
      if (typeof answer === "string") {
        reasons.push(answer);
        continue;
      }
      const [key, prompt] = answer;
      shown = true;
      if (diff.type === "insert-buffer" || diff.type === "insert-station") {
        const ends = [diff.from, diff.to].filter(pinned);
        add(
          key,
          {
            label: diff.name,
            subject: `the line from ${nameOf(diff.from)} to ${nameOf(diff.to)}`,
            pins: ends.flatMap((id) => byId.get(id)!.pins!),
          },
          change,
          prompt,
        );
      } else {
        add(key, machineView(key.slice("node:".length)), change, prompt);
      }
    }
    if (!shown) {
      unseen.push({
        change,
        reason:
          change.diffs.length === 0
            ? "More crews: nothing new to see on the floor"
            : (reasons[0] ?? "Nothing to see"),
      });
    }
  }

  return {
    views: [...views.values()].map(({ pins, ...view }) => ({
      ...view,
      ...frame(pins),
    })),
    unseen,
  };
}

const panoramas = new Map<string, Promise<ImageData>>();

/** A panorama's pixels, loaded once per page for each panorama. */
function loadPanorama(url: string): Promise<ImageData> {
  const known = panoramas.get(url);
  if (known) return known;
  const loading = new Promise<ImageData>((resolve, reject) => {
    const image = new Image();
    // A project's own world is served by the API; reading its pixels needs CORS.
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return reject(new Error("This browser cannot read images"));
      context.drawImage(image, 0, 0);
      resolve(context.getImageData(0, 0, canvas.width, canvas.height));
    };
    image.onerror = () =>
      reject(new Error("The plant's panorama could not be loaded"));
    image.src = url;
  }).catch((error: unknown) => {
    panoramas.delete(url);
    throw error;
  });
  panoramas.set(url, loading);
  return loading;
}

const radians = (value: number) => (value * Math.PI) / 180;

/**
 * Cuts `view` out of the equirectangular panorama as a JPEG, the way the
 * API's `splitPanorama` does, but 16:9 and pointed at the change.
 */
export async function cutView(
  panoramaUrl: string,
  view: Pick<PlantView, "yaw" | "pitch" | "fov">,
): Promise<{ mimeType: string; data: string }> {
  const source = await loadPanorama(panoramaUrl);
  const width = VIEW_WIDTH;
  const height = VIEW_HEIGHT;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  const out = context.createImageData(width, height);

  const yaw = radians(view.yaw);
  const pitch = radians(view.pitch);
  const forward = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
  const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const up = [-Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch), -Math.sin(pitch) * Math.cos(yaw)];
  const halfWide = Math.tan(radians(view.fov) / 2);
  const halfHigh = (halfWide * height) / width;
  const { width: sw, height: sh, data } = source;

  for (let row = 0; row < height; row++) {
    const down = (1 - (2 * (row + 0.5)) / height) * halfHigh;
    for (let column = 0; column < width; column++) {
      const across = ((2 * (column + 0.5)) / width - 1) * halfWide;
      const x = forward[0]! + across * right[0]! + down * up[0]!;
      const y = forward[1]! + down * up[1]!;
      const z = forward[2]! + across * right[2]! + down * up[2]!;
      const u = 0.5 + Math.atan2(x, z) / (2 * Math.PI);
      const v = 0.5 - Math.atan2(y, Math.hypot(x, z)) / Math.PI;
      // Nearest pixel: the view is no larger than the panorama's own detail.
      const sx = ((Math.floor(u * sw) % sw) + sw) % sw;
      const sy = Math.min(sh - 1, Math.max(0, Math.floor(v * sh)));
      const from = (sy * sw + sx) * 4;
      const to = (row * width + column) * 4;
      out.data[to] = data[from]!;
      out.data[to + 1] = data[from + 1]!;
      out.data[to + 2] = data[from + 2]!;
      out.data[to + 3] = 255;
    }
  }
  context.putImageData(out, 0, 0);
  const url = canvas.toDataURL("image/jpeg", 0.9);
  return { mimeType: "image/jpeg", data: url.slice(url.indexOf(",") + 1) };
}

export const dataUrl = ({ mimeType, data }: { mimeType: string; data: string }) =>
  `data:${mimeType};base64,${data}`;
