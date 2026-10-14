/**
 * Generates a world from one 360° equirectangular panorama (2:1, ideally
 * 2560x1280), e.g. a CC0 one from https://polyhaven.com/hdris/indoor.
 *
 *   pnpm --filter @repo/scripts generate-pano inputs/boiler_room.jpg \
 *     --model marble-1.0-draft --name "Boiler room" --prompt "..."
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import type { WorldModel } from "@repo/world";
import { main } from "./lib/cli";
import { logProgress, worldLabsClient } from "./lib/world-labs";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    // Sent explicitly: World Labs' docs disagree on what the default is.
    model: { type: "string", default: "marble-1.1-plus" },
    name: { type: "string" },
    prompt: { type: "string" },
  },
});

await main(async () => {
  const [file] = positionals;
  if (!file) {
    throw new Error(
      "Usage: generate-pano <panorama.jpg> [--model <name>] [--name <display name>] [--prompt <text>]",
    );
  }
  const worldLabs = worldLabsClient();

  const mediaAssetId = await worldLabs.uploadImage(
    path.basename(file),
    readFileSync(file),
  );
  console.log(`Uploaded ${path.basename(file)}`);

  const { operation_id } = await worldLabs.generateWorld({
    display_name: values.name,
    model: values.model as WorldModel,
    world_prompt: {
      type: "image",
      image_prompt: { source: "media_asset", media_asset_id: mediaAssetId },
      is_pano: true,
      text_prompt: values.prompt,
    },
  });
  console.log(`Started operation ${operation_id} on ${values.model}`);

  const operation = await worldLabs.waitForOperation(operation_id, {
    // marble-1.1-plus has been seen to run well past ten minutes.
    timeoutMs: 60 * 60_000,
    onProgress: logProgress(),
  });
  // The full record, not just the viewer URLs: it carries the scale metadata.
  console.log(JSON.stringify(operation.response, null, 2));
});
