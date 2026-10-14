/**
 * Downloads an already-generated world's assets for the web viewer harness.
 * Reading a world costs no credits.
 *
 *   pnpm --filter @repo/scripts fetch-world <worldId> [--out <dir>]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { extractWorldAssets } from "@repo/world";
import { main } from "./lib/cli";
import { worldLabsClient } from "./lib/world-labs";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string", default: "../apps/web/public/worlds/demo" },
  },
});

async function download(url: string, file: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Downloading ${url} failed: HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  writeFileSync(file, bytes);
  console.log(
    `  ${path.basename(file)} (${(bytes.length / 1e6).toFixed(1)} MB)`,
  );
}

await main(async () => {
  const [worldId] = positionals;
  if (!worldId) throw new Error("Usage: fetch-world <worldId> [--out <dir>]");

  const world = await worldLabsClient().getWorld(worldId);
  const assets = extractWorldAssets(world);
  if (!assets.colliderMeshUrl) throw new Error("World has no collider mesh");
  if (!assets.panoUrl) throw new Error("World has no panorama");

  const outDir = path.resolve(values.out);
  mkdirSync(outDir, { recursive: true });
  console.log(`Saving ${world.display_name ?? worldId} to ${outDir}`);

  // The full record, not just the viewer URLs: it carries the scale metadata.
  writeFileSync(
    path.join(outDir, "world.json"),
    JSON.stringify(world, null, 2),
  );
  await download(
    assets.spzUrls["500k"] ?? assets.splatUrl,
    path.join(outDir, "world.spz"),
  );
  if (assets.spzUrls.full_res) {
    await download(
      assets.spzUrls.full_res,
      path.join(outDir, "world-full.spz"),
    );
  }
  await download(assets.colliderMeshUrl, path.join(outDir, "collider.glb"));
  // Fixed name whatever the source format; browsers sniff the image type.
  await download(assets.panoUrl, path.join(outDir, "pano.png"));
});
