import { WorldLabsError } from "./client";
import type { World, WorldAssets } from "./types";

const SPZ_PREFERENCE = ["full_res", "500k", "100k"];

/** Flattens a finished World into the URLs a viewer needs. */
export function extractWorldAssets(world: World): WorldAssets {
  const assets = world.assets ?? {};
  const spzUrls = assets.splats?.spz_urls ?? {};
  const splatUrl =
    SPZ_PREFERENCE.map((key) => spzUrls[key]).find(Boolean) ??
    Object.values(spzUrls)[0];
  if (!splatUrl) {
    throw new WorldLabsError(
      "World Labs response did not include a usable SPZ asset URL",
    );
  }

  return {
    worldId: world.id ?? world.world_id ?? null,
    marbleUrl: world.world_marble_url ?? null,
    splatUrl,
    spzUrls,
    panoUrl: assets.imagery?.pano_url ?? null,
    thumbnailUrl: assets.thumbnail_url ?? null,
    colliderMeshUrl: assets.mesh?.collider_mesh_url ?? null,
    caption: assets.caption ?? null,
    metricScaleFactor:
      assets.splats?.semantics_metadata?.metric_scale_factor ?? null,
    groundPlaneOffset:
      assets.splats?.semantics_metadata?.ground_plane_offset ?? null,
  };
}
