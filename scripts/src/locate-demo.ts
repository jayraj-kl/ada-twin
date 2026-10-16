/**
 * Finds the demo machines in a panorama both ways, cut into views and whole,
 * and saves what each found as marked-up copies of the panorama to compare.
 *
 *   pnpm --filter @repo/scripts locate-demo [panorama] [--out locate-out]
 *
 * Reads the model key from apps/api/.env (see apps/api/.env.example).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { PNG } from "pngjs";
import {
  type Machine,
  type Placement,
  createGeminiModel,
  locateInViews,
  locateMachines,
  splitPanorama,
} from "@repo/agent";
import { main } from "./lib/cli";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { out: { type: "string", default: "locate-out" } },
});
const panoramaPath =
  positionals[0] ?? "../apps/frontend/public/worlds/current/pano.png";

// The machines the web app's sample plant lists for the demo world.
const MACHINES: Machine[] = [
  {
    id: "pumps",
    name: "Feed pumps",
    type: "centrifugal pump",
    manufacturer: "KSB",
    model: "Etanorm 065",
    count: 2,
  },
  {
    id: "boilers",
    name: "Boilers",
    type: "gas-fired boiler, blue burner housing",
    count: 2,
  },
  {
    id: "panel",
    name: "Control panel check",
    type: "green instrument cabinet",
    count: 1,
  },
];

const COLOURS: [number, number, number][] = [
  [255, 40, 200],
  [0, 220, 255],
  [255, 140, 0],
  [120, 255, 60],
];

/** The panorama with a ringed dot on each point found, one colour a machine. */
function markUp(png: PNG, placements: Placement[]): Buffer {
  const copy = new PNG({ width: png.width, height: png.height });
  png.data.copy(copy.data);
  const radius = Math.round(png.width / 200);
  placements.forEach((placement, index) => {
    const colour = COLOURS[index % COLOURS.length]!;
    for (const [u, v] of placement.points) {
      const cx = Math.round(u * png.width);
      const cy = Math.round(v * png.height);
      for (let dy = -radius * 2; dy <= radius * 2; dy++) {
        for (let dx = -radius * 2; dx <= radius * 2; dx++) {
          const distance = Math.hypot(dx, dy);
          const ring = distance > radius * 1.6 && distance <= radius * 2;
          if (distance > radius && !ring) continue;
          const x = (((cx + dx) % png.width) + png.width) % png.width;
          const y = cy + dy;
          if (y < 0 || y >= png.height) continue;
          copy.data.set(
            ring ? [0, 0, 0, 255] : [...colour, 255],
            (y * png.width + x) * 4,
          );
        }
      }
    }
  });
  return PNG.sync.write(copy);
}

function report(title: string, placements: Placement[], seconds: number) {
  console.log(`\n${title} (${seconds.toFixed(1)} s)`);
  placements.forEach((placement, index) => {
    const machine = MACHINES.find(({ id }) => id === placement.id)!;
    const points = placement.points
      .map(([u, v]) => `(${u.toFixed(3)}, ${v.toFixed(3)})`)
      .join(" ");
    console.log(
      `  ${machine.name} [colour ${index + 1}]: ${placement.points.length} of ${machine.count ?? 1} ${points}`,
    );
    if (placement.note) console.log(`    ${placement.note}`);
  });
}

await main(async () => {
  const ask = createGeminiModel();
  const bytes = readFileSync(panoramaPath);
  const panorama = { bytes: new Uint8Array(bytes), mimeType: "image/png" };
  const png = PNG.sync.read(bytes);
  mkdirSync(values.out, { recursive: true });

  const timed = async <T>(run: () => T | Promise<T>) => {
    const started = performance.now();
    const result = await run();
    return { result, seconds: (performance.now() - started) / 1000 };
  };

  const cut = await timed(() => splitPanorama(panorama));
  const views = cut.result;
  if (!views) throw new Error(`${panoramaPath} is not a PNG or JPEG`);
  for (const view of views) {
    writeFileSync(join(values.out, `view-${view.yaw}.jpg`), view.file.bytes);
  }

  // Both modes at once; each is timed on its own.
  const [split, whole] = await Promise.all([
    timed(() => locateInViews(ask, views, MACHINES)),
    timed(() => locateMachines(ask, panorama, MACHINES, { split: false })),
  ]);

  report(
    `Cut into ${views.length} views (the cutting took ${cut.seconds.toFixed(1)} s more)`,
    split.result,
    split.seconds,
  );
  report("Whole panorama", whole.result, whole.seconds);
  writeFileSync(
    join(values.out, "found-views.png"),
    markUp(png, split.result),
  );
  writeFileSync(
    join(values.out, "found-whole.png"),
    markUp(png, whole.result),
  );
  console.log(`\nSaved the views and both marked-up panoramas to ${values.out}/`);
});
