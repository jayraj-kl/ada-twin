export type WorldModel =
  "marble-1.0-draft" | "marble-1.0" | "marble-1.1" | "marble-1.1-plus";

export type PromptContent =
  | { source: "uri"; uri: string }
  | { source: "media_asset"; media_asset_id: string };

export interface TextWorldPrompt {
  type: "text";
  text_prompt: string;
}

export interface ImageWorldPrompt {
  type: "image";
  image_prompt: PromptContent;
  is_pano?: boolean;
  text_prompt?: string;
}

export interface MultiImageWorldPrompt {
  type: "multi-image";
  multi_image_prompt: { content: PromptContent; azimuth?: number }[];
  reconstruct_images?: boolean;
  text_prompt?: string;
}

export type WorldPrompt =
  TextWorldPrompt | ImageWorldPrompt | MultiImageWorldPrompt;

export interface GenerateWorldRequest {
  world_prompt: WorldPrompt;
  display_name?: string;
  model?: WorldModel;
  seed?: number;
  tags?: string[];
}

export interface World {
  id?: string;
  world_id?: string;
  world_marble_url?: string | null;
  display_name?: string | null;
  model?: string | null;
  world_prompt?: WorldPrompt | null;
  assets?: {
    caption?: string | null;
    thumbnail_url?: string | null;
    splats?: {
      spz_urls?: Record<string, string> | null;
      semantics_metadata?: {
        metric_scale_factor?: number;
        ground_plane_offset?: number;
      } | null;
    } | null;
    mesh?: { collider_mesh_url?: string | null } | null;
    imagery?: { pano_url?: string | null } | null;
  } | null;
}

export interface Operation {
  operation_id: string;
  done: boolean;
  error?: { code?: number | null; message?: string | null } | null;
  metadata?: {
    world_id?: string | null;
    progress?: { status?: string; description?: string } | null;
  } | null;
  response?: World | null;
}

export interface WorldAssets {
  worldId: string | null;
  marbleUrl: string | null;
  splatUrl: string;
  spzUrls: Record<string, string>;
  panoUrl: string | null;
  thumbnailUrl: string | null;
  colliderMeshUrl: string | null;
  caption: string | null;
  /** Multiplies splat units into metres; null when World Labs gave none. */
  metricScaleFactor: number | null;
  /** Subtract from Y after scaling to put the floor at y=0. */
  groundPlaneOffset: number | null;
}
