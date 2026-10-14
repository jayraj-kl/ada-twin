# Factory world MVP: how to get a walkable manufacturing-plant world

Research notes. All sources were read on **2026-10-12**. Statements marked **Verified** come straight from the linked source. Statements marked **Inference** are my own reasoning and have not been tested. No generation API was called and no credits were spent.

Credit-to-money conversions use the published API rate of $1.00 per 1,250 credits ([API pricing](https://docs.worldlabs.ai/api/pricing)).

---

## 1. Recommendation

**Use the World Labs API with a CC0 360° panorama of a real plant room as an `image` prompt, on `marble-1.1-plus`, and render it with Spark.**

| Item            | Choice                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input           | [Poly Haven "Boiler Room"](https://polyhaven.com/a/boiler_room): a 360° equirectangular photo of a real boiler hall with yellow pipework, valves, gauges, pumps and control cabinets down a long hall. Licence CC0 ([Poly Haven licence](https://polyhaven.com/license)). Tonemapped JPG is 8192x4096, 5.4 MB: `https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/boiler_room.jpg` |
| Prompt type     | `type: "image"` with `is_pano: true` (or leave the default `auto`). A recognised pano skips pano generation, so that step costs 0 credits ([API pricing](https://docs.worldlabs.ai/api/pricing)).                                                                                                                                                                                                     |
| Model           | `marble-1.1-plus`, the model World Labs documents for "the largest worlds" ([Models](https://docs.worldlabs.ai/marble/models)). Set `model` explicitly (see the default-model conflict in section 3.2).                                                                                                                                                                                               |
| Expected cost   | 1,500 to 3,000 credits per world = **$1.20 to $2.40**. Observed median for pano input is $1.20, P75 and max $2.40 ([API pricing](https://docs.worldlabs.ai/api/pricing)).                                                                                                                                                                                                                             |
| Cheap pre-check | Run the same request on `marble-1.0-draft` first: 150 credits = **$0.12**. It confirms the pano is accepted and the pipeline works. It is a different model, so it does not predict the size of the 1.1 Plus result.                                                                                                                                                                                  |
| Viewer          | [Spark](https://sparkjs.dev) (`@sparkjsdev/spark`) on three.js, plus the collider GLB and a physics library for walking.                                                                                                                                                                                                                                                                              |
| Fallback        | Same model with a `text` prompt describing a pump and boiler hall: 1,580 to 3,080 credits ($1.26 to $2.46). No input licence to track, but less control over what appears.                                                                                                                                                                                                                            |

**Why this and not what was tried before.** The earlier attempt used 8 perspective views from one standpoint. World Labs says a 360 panorama "gives the most accurate single-space layout" and the "most control over the final world layout" ([Multi-image tips](https://docs.worldlabs.ai/marble/create/prompt-guides/multi-image-prompt), [Pano tips](https://docs.worldlabs.ai/marble/create/prompt-guides/pano-prompt)), and world size is driven by the model: only 1.1 Plus "automatically expands its coverage of 3D space" ([Models](https://docs.worldlabs.ai/marble/models)).

**Risk to know before spending.** No source states how large a 1.1 Plus world is in metres, and none promises a corridor-with-rooms result like the reference demo. A single panorama is still one standpoint. Whether one 1.1 Plus world is "reference scale" is untested (**Inference**). If one world is too small, the route to more space is several worlds placed side by side (section 3.3).

**To get closer to reference scale (Inference, untested).** Generate 2 or 3 worlds from different CC0 panoramas (for example Boiler Room, [Machine Shop 02](https://polyhaven.com/a/machine_shop_02), [Industrial Workshop Foundry](https://polyhaven.com/a/industrial_workshop_foundry)) and load them as separate `SplatMesh` objects in one Spark scene, positioned in metres using each world's `metric_scale_factor`. Spark states it can "render multiple splat objects together with correct sorting" ([Spark README](https://github.com/sparkjsdev/spark)). Budget: 3 worlds = 4,500 to 9,000 credits = $3.60 to $7.20. The rooms would be different plants joined by a doorway, not one coherent building.

### Ranked alternatives

1. **Text prompt on `marble-1.1-plus`** (1,580 to 3,080 credits). Ranks lower because the equipment is invented by the model, so plant credibility depends on prompt luck.
2. **Conventional three.js scene from a CC-BY mesh**, for example [Facility Mechanical Room](https://sketchfab.com/3d-models/none-ec811076214648928567173c773e8da6) (CC Attribution, about 2.05 M faces, tagged scan-to-BIM). Free, exact collisions, any size. Ranks lower because it drops the "generated world" pipeline that the idea is meant to test, and it looks like CAD, not a photographed plant.
3. **Real capture plus Gaussian splatting** (Scaniverse, Polycam, Postshot, nerfstudio). Best fidelity and truly walkable. Ranks last for the MVP only because it needs access to a real plant or a usable multi-view dataset, which is the constraint here.

---

## 2. Requirements checklist

- [ ] **World Labs Platform account and API key** from [platform.worldlabs.ai](https://platform.worldlabs.ai). API billing is separate from the Marble web app; Marble app credits cannot be used with the API ([API pricing](https://docs.worldlabs.ai/api/pricing)).
- [ ] **Credits.** Minimum purchase is 6,250 credits for $5.00, and API credits do not expire ([API pricing](https://docs.worldlabs.ai/api/pricing)). $5 covers the draft check plus two 1.1 Plus worlds at the maximum price (150 + 3,000 + 3,000 = 6,150). Check the balance with `GET /marble/v1/credits`.
- [ ] **Overage awareness.** A request admitted on a low balance can take the balance negative, and the shortfall is invoiced at month end. Turning auto-refill off does not cap usage ([API pricing](https://docs.worldlabs.ai/api/pricing)).
- [ ] **Input asset.** One equirectangular 2:1 panorama, recommended 2560 px wide, under 20 MB, png/jpg/webp ([Prompt guidelines](https://docs.worldlabs.ai/marble/create/prompt-guides)). Downscale the 8192x4096 Poly Haven JPG to 2560x1280 (**Inference**: the recommended width suggests larger gives no benefit).
- [ ] **A way to deliver the image.** A `uri` must be fetchable with no cookies, referer or auth, and hotlink-protected hosts return a 400. Otherwise upload it as a media asset ([API FAQ](https://docs.worldlabs.ai/api/faq)). `@repo/world` already supports media-asset upload.
- [ ] **Patience and rate limits.** A generation takes "about 5 minutes"; default limit is about 3 starts per minute and 60 per hour ([Rate limits](https://docs.worldlabs.ai/api/rate-limits)).
- [ ] **Viewer library.** `npm install @sparkjsdev/spark` (v2.3.1, MIT, released 2026-10-01) with three.js; the README example pins three 0.180.0 ([Spark README](https://github.com/sparkjsdev/spark)).
- [ ] **Walking and collision.** The collider GLB (`assets.mesh.collider_mesh_url`) plus a physics engine. World Labs' own examples use Rapier ([Interactive world examples](https://docs.worldlabs.ai/api/interactive-world-examples)).
- [ ] **Scale metadata.** Read `assets.splats.semantics_metadata` and apply it so pins and agents work in metres ([Rendering SPZ](https://docs.worldlabs.ai/api/rendering-spz)).
- [ ] **Hardware.** A WebGL2 browser. Spark's stated budgets: computer 1 to 5 million splats, iPhone 1 to 3 million, Android 1 to 2 million, Quest 3 at most 1 million ([Spark performance](https://sparkjs.dev/docs/performance/)). A Marble full-resolution world is about 2 million splats ([Export specs](https://docs.worldlabs.ai/marble/export/specs)). No local GPU is needed for generation.
- [ ] **Attribution.** CC0 input needs none. World Labs may ask paid users to show "Generated using World Labs" on public output ([Terms of Service](https://docs.worldlabs.ai/terms-of-service), 3.7(b)).

Gaps in `@repo/world` relative to the current API (observation only, nothing was changed): `ImageWorldPrompt` has no `is_pano` field (harmless, the API default is `auto`), there is no `video` prompt type, and `World.assets.splats` does not type `semantics_metadata`. `SPZ_PREFERENCE` (`full_res`, `500k`, `100k`) matches the documented keys.

---

## 3. World Labs Marble: capabilities and limits

### 3.1 Input types

All **Verified** from [Prompt guidelines](https://docs.worldlabs.ai/marble/create/prompt-guides), the [OpenAPI spec](https://docs.worldlabs.ai/api/reference/openapi.yaml) and [API pricing](https://docs.worldlabs.ai/api/pricing) unless noted.

| Input                                 | Limits                                                                                                             | Extra pano cost | What the docs say it is for                                                                                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text (`type: "text"`)                 | Up to 2,000 characters                                                                                             |              80 | Smallest request. The API generates a pano first, then the world.                                                                                                                                                                                 |
| Image, not a pano (`type: "image"`)   | Max 20 MB; png (recommended), jpg, webp; recommended 1024 px long side; aspect 16:9 to 9:16                        |              80 | The model "may expand beyond what's visible" in the image ([Image tips](https://docs.worldlabs.ai/marble/create/prompt-guides/image-prompt)).                                                                                                     |
| Panorama (`type: "image"`, `is_pano`) | Full 360° equirectangular, exactly 2:1, recommended 2560 px wide. `is_pano` is `auto` (default), `true` or `false` |               0 | "Maximum control"; "complete spatial information" ([Pano tips](https://docs.worldlabs.ai/marble/create/prompt-guides/pano-prompt)). Only one pano per world.                                                                                      |
| Multi-image (`type: "multi-image"`)   | Up to 4 images with direction (`azimuth`); up to 8 with `reconstruct_images: true`                                 |             100 | Reconstruction mode (Auto Layout in the app) "reconstructs a single space" and needs same aspect ratio, same resolution, same space, some overlap ([Multi-image tips](https://docs.worldlabs.ai/marble/create/prompt-guides/multi-image-prompt)). |
| Video (`type: "video"`)               | Max 100 MB, max 30 seconds; mp4, mov, webm                                                                         |             100 | "Short video of a static space"; rotate to cover 180° to 360° ([Video tips](https://docs.worldlabs.ai/marble/create/prompt-guides/video-prompt)).                                                                                                 |

Source conflict on video formats: the prompt guide lists mp4, mov, webm; the OpenAPI spec lists mp4, webm, mov, avi; the [Quickstart](https://docs.worldlabs.ai/api) lists mp4, mov, mkv. mp4 is in all three.

**Which input gives the largest explorable space?** No source ranks input types by world size. What the docs do say (**Verified**):

- Size is tied to the model: 1.1 Plus "uses more credits to create a bigger world when prompted for outdoor or larger indoor spaces" ([Quickstart](https://docs.worldlabs.ai/api)).
- Every input is first turned into a single panorama, then into a world ([API pricing](https://docs.worldlabs.ai/api/pricing)). So text, image, multi-image and video all pass through one panorama.
- Multi-image reconstruction and panoramas both produce "a single space". For "a larger multi-room space such as a whole house", World Labs says to generate a separate world per room and combine them in Studio Compose ([Multi-image tips](https://docs.worldlabs.ai/marble/create/prompt-guides/multi-image-prompt)).
- Video guidance is about rotation, not walking: "Rotate the camera to cover a large viewing angle" ([Video tips](https://docs.worldlabs.ai/marble/create/prompt-guides/video-prompt)).

**Inference:** a 30-second walkthrough video down a corridor is not a documented way to get a corridor-sized world. The lever for size is `marble-1.1-plus` plus a prompt that shows a large indoor space, and beyond that, several worlds.

### 3.2 Models, credits and money

**Verified** from [Marble models](https://docs.worldlabs.ai/marble/models), [API models](https://docs.worldlabs.ai/api/models) and [API pricing](https://docs.worldlabs.ai/api/pricing).

| API `model`        | Description in the docs                                                    |         World generation credits |          Money |
| ------------------ | -------------------------------------------------------------------------- | -------------------------------: | -------------: |
| `marble-1.0-draft` | "Our fastest model, ideal for quickly exploring ideas and testing prompts" |                              150 |          $0.12 |
| `marble-1.0`       | "Legacy model retained for ongoing explorations"                           |                            1,500 |          $1.20 |
| `marble-1.1`       | Recommended starting model; "improved quality at a fixed cost"             |                            1,500 |          $1.20 |
| `marble-1.1-plus`  | "Our latest and most advanced model for creating the largest worlds"       | 1,500 base + 0 to 1,500 variable | $1.20 to $2.40 |

Add the pano cost from section 3.1 to get the request total. Full totals for 1.1 Plus: pano 1,500 to 3,000; text and non-pano image 1,580 to 3,080; multi-image and video 1,600 to 3,100.

- Observed 1.1 Plus costs through 2026-06-25, all input types: mean $1.714, median $1.280, P75/P90 $2.464, max $2.480. The variable part "depends on the size of the world" and is decided by the system, so the developer cannot cap it per request.
- Credit price: $1.00 per 1,250 credits, minimum purchase 6,250 credits ($5.00), credits do not expire.
- Not billed: API key creation, media asset upload, operation polling. PLY splat export is free. High-quality mesh export is 3,500 credits ($2.80) per world.
- 1.1 and 1.1 Plus were added on 2026-04-02 ([Release notes](https://docs.worldlabs.ai/marble/release-notes)). I found no World Labs blog post about them.

**Source conflict, default model.** [API models](https://docs.worldlabs.ai/api/models) says the default is `marble-1.0` when no model is given. The [OpenAPI spec](https://docs.worldlabs.ai/api/reference/openapi.yaml) declares `default: marble-1.1`. Always send `model`.

### 3.3 Expanding and composing larger worlds

| Feature                                      | What it does                                                                                                                                                                                                                                                                                                                                                                     | In the API?                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Expand**                                   | Extends a world past its boundary from a chosen viewpoint. One expansion per world; no expanding up or down. "You cannot expand a world generated with Marble 1.1 Plus." Listed under the Pro plan. Costs 2,000 app credits. ([Expand](https://docs.worldlabs.ai/marble/create/prompt-guides/expand), [Subscriptions](https://docs.worldlabs.ai/marble/support/account-billing)) | **No endpoint.** The [OpenAPI spec](https://docs.worldlabs.ai/api/reference/openapi.yaml) has only credits, media-assets, operations, `pano:depth_to_rgb`, and worlds get / list / delete / export / generate.                                                                                                                                                                                                                  |
| **Studio Compose**                           | Manually position, rotate and scale several worlds into one environment. "There is no floor plan input that auto-connects rooms." ([Compose](https://docs.worldlabs.ai/marble/create/studio-tools/compose))                                                                                                                                                                      | **No endpoint.** Web app only.                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Chisel**                                   | Block out walls and volumes, or upload a GLB/FBX (max 100 MB), place a panorama camera, add a text prompt, generate ([Chisel basics](https://docs.worldlabs.ai/marble/create/chisel-tools/chisel-basics)).                                                                                                                                                                       | **Partly.** `POST /marble/v1/pano:depth_to_rgb` turns a 2:1 depth panorama (EXR, or PNG with `z_min` and `z_max`) plus a text prompt into an RGB panorama ([Depth to RGB](https://docs.worldlabs.ai/api/reference/pano/depth_to_rgb)). That pano can then go to `worlds:generate`. World Labs publishes a [web-chisel-depth-png example](https://github.com/worldlabsai/worldlabs-api-examples/tree/main/web-chisel-depth-png). |
| `depth-pano` and `inpaint-pano` prompt types | Appear in the spec as `DepthPanoPrompt` and `InpaintPanoPrompt`.                                                                                                                                                                                                                                                                                                                 | **Not accepted by `worlds:generate`.** The request schema allows only text, image, multi-image and video. The two pano types appear only on the returned `World.world_prompt` ([OpenAPI spec](https://docs.worldlabs.ai/api/reference/openapi.yaml)).                                                                                                                                                                           |
| Pano edit                                    | Edit the panorama before generating; 150 app credits per edit ([Release notes](https://docs.worldlabs.ai/marble/release-notes)).                                                                                                                                                                                                                                                 | No endpoint.                                                                                                                                                                                                                                                                                                                                                                                                                    |

The Marble launch post (2025-11-12) describes the intent: "you can compose any number of worlds to build out extremely large spaces with Marble's composer mode" ([blog](https://www.worldlabs.ai/blog/marble-world-model)).

**Inference:** since Expand and Compose are app-only, an API-only MVP has two ways to get more space: let 1.1 Plus size the world, or compose several worlds in its own viewer. The Chisel route through `depth_to_rgb` is the only API path that controls layout (for example a long hall with bays), but it needs a depth panorama rendered from a 3D blockout, which is more work than the MVP needs.

### 3.4 Outputs, coordinates and scale

**Verified** from [Export specs](https://docs.worldlabs.ai/marble/export/specs), [Quickstart](https://docs.worldlabs.ai/api), [Rendering SPZ](https://docs.worldlabs.ai/api/rendering-spz), [Export API](https://docs.worldlabs.ai/api/reference/worlds/export) and [API FAQ](https://docs.worldlabs.ai/api/faq).

- **Splats:** `assets.splats.spz_urls` with keys `100k`, `500k`, `full_res`. Full resolution is about 2 million splats, low-res about 500k.
- **PLY:** `POST /marble/v1/worlds/{id}:export` with `{"asset_type":"splats","format":"ply","resolution":"full_res"}`. Resolutions `full_res`, `500k`, `150k`, `100k`. Free.
- **Collider mesh:** `assets.mesh.collider_mesh_url`, GLB, 100 to 200k triangles, typically 3 to 4 MB, "optimized for simple physics calculations". Not for visual rendering ([Mesh export](https://docs.worldlabs.ai/marble/export/mesh)).
- **High-quality mesh:** export with `{"asset_type":"mesh","format":"glb"}`. Produces a textured GLB of about 600k triangles and a vertex-coloured GLB of about 1M triangles, takes up to an hour, 3,500 credits.
- **Panorama:** `assets.imagery.pano_url`, an equirectangular PNG of 2560x1280. Also `thumbnail_url` and `caption`.
- **Scale:** splats are "in arbitrary model units, not meters". `semantics_metadata.metric_scale_factor` multiplies XYZ and splat sizes to get metres. `ground_plane_offset` is then subtracted from Y to put the floor at y=0; apply it to centres only, not sizes. A `metric_scale_factor` of 1.0 means scale could not be inferred. Both fields are populated for worlds generated since December 2025.
- **Axes:** generated SPZ uses the `marble_raw_opencv` convention. For a three.js frame, convert axes after scaling; "Marble's web viewer applies a 180 degree rotation around the X axis".

**Source conflict, coordinate system.** [Release notes](https://docs.worldlabs.ai/marble/release-notes) (2025-12-11) say world generations "now export in the OpenGL coordinate system (previously OpenCV)". [Export specs](https://docs.worldlabs.ai/marble/export/specs) still say default worlds are OpenCV, and [Rendering SPZ](https://docs.worldlabs.ai/api/rendering-spz) says API SPZ is `marble_raw_opencv`. Treat API SPZ as OpenCV and check visually; if the world loads upside down, flip it.

Meshes are derived from the splat and show artifacts "in regions that are hard to reconstruct: thin or complex structures, transparent or reflective surfaces" ([Mesh export](https://docs.worldlabs.ai/marble/export/mesh)). That matters for pipework: expect the collider to be rough around pipes.

### 3.5 Licence and usage terms

**Verified** from the [Terms of Service](https://docs.worldlabs.ai/terms-of-service), last updated 2026-01-21.

- **API and paid users own their output** and may use it commercially (3.3(b)). API users may "use, reproduce, modify, adapt, create derivative works from, distribute, and sublicense the Output for Commercial Purposes" (3.3(d)). "Paid Account Users" includes accounts with purchased, unused credits and "API access arrangements with associated fees" (13.23).
- **Free accounts:** World Labs retains the rights and grants a licence "solely for personal, Non-Commercial Use" (3.3(a)). Status is fixed at generation time (3.3(c)).
- **Input rights are the user's responsibility:** users must have "appropriate rights to any Inputs" and ensure outputs do not infringe; for API users this extends to downstream distribution (4.2(b)).
- **Training:** users grant World Labs a licence to use inputs and outputs, including for training. Paid users can opt out on the account page (3.6).
- **Attribution:** on request, paid users must credit World Labs on public or commercial output, and must not remove embedded notices or watermarks (3.7(b), 3.7(d)).
- **Caching:** API users must "not cache, store, or persist API responses beyond the duration specified in Documentation" (2.10(a)). I found no such duration in the docs (open question).
- **Content:** "Humans and animals are not well supported by the model yet" ([Image tips](https://docs.worldlabs.ai/marble/create/prompt-guides/image-prompt)), and input can be rejected by content policy ([API FAQ](https://docs.worldlabs.ai/api/faq)).

---

## 4. Capture and input guidance

### 4.1 What World Labs says

**Verified** from the prompt guides linked in section 3.1.

- **Space type:** images with "clear spatial definition" (visible floors, walls, ceilings), multiple elements, good lighting. Avoid close-ups, blur, borders, very dark or overexposed images.
- **Indoor vs outdoor:** no stated preference. 1.1 Plus sizes up for "outdoor or larger indoor spaces" ([Quickstart](https://docs.worldlabs.ai/api)).
- **Overlap:** for directional multi-image (up to 4), images without overlap let the model fill in between. For reconstruction (up to 8), "images captured in close proximity of each other but covering different viewing directions, and with some overlap" work best. All must share aspect ratio and resolution.
- **Panoramas vs photos:** a pano needs exactly 2:1 and full vertical coverage ("phone panoramas often lack full vertical 180 coverage"); the left and right edges must be continuous. Sources named: a 360 camera, a 3D render, or a pano downloaded from a Marble world.
- **Video:** one continuous take, steady, rotate to cover 180° to 360°, fixed focal length and exposure, max 30 s and 100 MB. "Most artifacts in the generated world trace back to the source video."
- **Moving people:** "Keep the space static: Avoid moving people or objects; the model reconstructs a static scene best."
- **Unseen areas:** "Parts of the scene the cameras never see, such as behind closed doors, around solid walls, or up a staircase, are generated plausibly", so they will not match the real plant.
- **Reflective metal and thin pipes:** World Labs gives no capture advice on these. Its only statement is about meshes: artifacts appear on "thin or complex structures, transparent or reflective surfaces".

### 4.2 What Gaussian-splatting primary sources say

Relevant to real-capture splatting (section 6), less so to Marble, which generates rather than reconstructs.

- **3DGS paper, limitations** ([Kerbl et al. 2023](https://ar5iv.labs.arxiv.org/html/2308.04079), read through an automated summary, wording paraphrased): artifacts appear in regions that are not well observed; the method can produce elongated or "splotchy" Gaussians and popping; peak training GPU memory "can exceed 20 GB" in the prototype; scenes used "1-5 million Gaussians". The paper does not single out metal or pipes.
- **nerfstudio** ([custom data](https://docs.nerf.studio/quickstart/custom_dataset.html), [Splatfacto](https://docs.nerf.studio/nerfology/methods/splat.html)): "Try your best to capture overlapping, non-blurry images"; for video, about 3 frames per second of footage; 360 video is supported through `--camera-type equirectangular` with 8 images sampled per equirect frame by default (14 suggested if alignment struggles). "A common artifact in splatting is long, spikey gaussians."
- **Polycam** ([Gaussian splatting tool](https://poly.cam/tools/gaussian-splatting)): 20 to 200 images in PNG or JPG, or an mp4; "minimal motion blur or shallow depth of field". Its page claims splatting "can effectively render shiny, reflective objects as well as long and thin details". That is marketing copy, not a test.

**Honest summary:** the primary sources I read do not confirm the common claim that reflective metal and thin pipes are hard cases for splat capture. The claim appeared only in secondary sources (a SketchUp help page and vendor blogs), which I did not rely on. The verified statements are narrower: poorly observed regions cause artifacts, and Marble's derived meshes are weak on thin and reflective structures.

---

## 5. Where to get factory input without a real plant

Every candidate below was checked to exist on 2026-10-12. "Viewed" means I looked at the image.

### 5.1 Equirectangular industrial panoramas (best fit for Marble)

**Poly Haven HDRIs.** Licence: "Our assets are all licensed as CC0", usable "for any purpose, including commercial work", no attribution required ([licence page](https://polyhaven.com/license)). Each has a tonemapped JPG at `https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/<id>.jpg`. Found through the [Poly Haven API](https://api.polyhaven.com/assets?t=hdris), filtered to the `indoor` category (301 of 997 HDRIs).

| Asset                                                                                                                                          | What it shows                                                                                                                                                                                                      | Max resolution    |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| [Boiler Room](https://polyhaven.com/a/boiler_room) (`boiler_room`)                                                                             | **Viewed.** Long boiler hall: yellow gas pipework, valves, pressure gauges, pumps on blue plinths, green control cabinets, clear walkways both ways. Tags: machine, industrial, pipes, factory. No people visible. | 17000x8500        |
| [Machine Shop 02](https://polyhaven.com/a/machine_shop_02) (`machine_shop_02`)                                                                 | **Viewed.** Large workshop hall with overhead cranes, machine parts on pallets, side bays.                                                                                                                         | 16500x8250        |
| [Industrial Workshop Foundry](https://polyhaven.com/a/industrial_workshop_foundry) (`industrial_workshop_foundry`)                             | **Viewed.** Modern fabrication hall: gantry cranes, welding screens, painted green walkways with yellow lines, mezzanine office.                                                                                   | 24576x12288       |
| [Industrial Pipe & Valve 01](https://polyhaven.com/a/industrial_pipe_and_valve_01) (`industrial_pipe_and_valve_01`)                            | **Viewed.** Despite the name, a pipe and valve stock warehouse with racking, not process pipework.                                                                                                                 | 16384x8192        |
| [Pump House](https://polyhaven.com/a/pump_house) (`pump_house`)                                                                                | Not viewed. Tags: brick, pump, pipe, shed.                                                                                                                                                                         | 16384x8192        |
| [Machine Shop 01](https://polyhaven.com/a/machine_shop_01), [Machine Shop 03](https://polyhaven.com/a/machine_shop_03)                         | Not viewed. Tags: workshop, hall, industrial, machine.                                                                                                                                                             | about 16500x8250  |
| [Vintage Measuring Lab](https://polyhaven.com/a/vintage_measuring_lab), [Aerodynamics Workshop](https://polyhaven.com/a/aerodynamics_workshop) | Not viewed. Tags: machine, industrial, workshop.                                                                                                                                                                   | 17000x8500        |
| [Peppermint Powerplant 2](https://polyhaven.com/a/peppermint_powerplant_2), [Distribution Board](https://polyhaven.com/a/distribution_board)   | Not viewed. Abandoned; tags: industrial, factory, machine, electrical.                                                                                                                                             | about 20000x10000 |

**Wikimedia Commons.** Files in the category "360° panoramas with equirectangular projection", all 2:1, licence taken from each file page's metadata:

- [Zeche Erin Schacht3 Panorama 04](https://commons.wikimedia.org/wiki/File:Zeche_Erin_Schacht3_Panorama_04.jpg) and the rest of that series (02 to 12), 7364x3682, **CC BY-SA 4.0**, a colliery winding tower. Not viewed, so I cannot say whether they are interiors.
- "Industriebrache Kokerei Kaiserstuhl Panorama 01/02/03" (coking plant), about 10700x5360, **CC BY-SA 4.0**. Not viewed; title suggests outdoor.

CC BY-SA requires attribution and share-alike on adaptations. Whether a generated world counts as an adaptation is a legal question I cannot settle. CC0 avoids it.

### 5.2 Walkthrough video

- [Chernobyl Nuclear Power Plant: Unit 3 Main Circulation Pumps](https://commons.wikimedia.org/wiki/File:Chernobyl_Nuclear_Power_Plant-_Unit_3_Main_Circulation_Pumps.webm): 2560x1440, 10 min 37 s, 381 MB, **CC BY 3.0**, by Carl Willis. Not watched. It is a visitor tour, so expect people and handheld motion, and it would need cutting to under 30 s and transcoding from webm.
- [The winding machine at Göteborgs Remfabrik](https://commons.wikimedia.org/wiki/File:The_winding_machine_at_G%C3%B6teborgs_Remfabrik.webm): 1920x1080, 18.5 s, **CC BY 3.0**. A single running machine, so the scene is not static.
- **Stock sites.** [Pexels](https://www.pexels.com/license/): free to use and modify, no attribution, no reselling unaltered copies. [Pixabay](https://pixabay.com/service/license-summary/): free to use and modify, no standalone redistribution. Neither licence page mentions AI or use as generative input. I did not verify any specific factory clip on these sites, and the [Mixkit licence page](https://mixkit.co/license/) did not return its terms. Coverr and Internet Archive were not checked.

**Inference:** video is the weakest option here. World Labs wants a static, people-free, rotation-style clip of at most 30 s, and stock factory footage is usually the opposite (workers, running machines, cuts, tracking shots).

### 5.3 3D factory scenes (render to a panorama, or use directly)

- **Sketchfab**, downloadable models, licence as returned by the [Sketchfab search API](https://api.sketchfab.com/v3/search?type=models&downloadable=true&q=pipe%20room). Downloading needs a free account. I did not open the models.
  - [Facility Mechanical Room](https://sketchfab.com/3d-models/none-ec811076214648928567173c773e8da6), CC Attribution, about 2.05 M faces, tags bim, mep, scantobim.
  - [Abandoned Factory Hall Scan](https://sketchfab.com/3d-models/none-b7866279b7224c48a31b85fe7cedae59), CC Attribution, about 96k faces.
  - [Factory pipe kit](https://sketchfab.com/3d-models/none-647a6eb8ef0049de892cfacd79221c3a), CC Attribution, about 74k faces (modular pipes for building a scene).
  - [[WIP] Machinery Room](https://sketchfab.com/3d-models/none-43e391b59f8c41118877ecb1d06b2e40), CC Attribution, about 55k faces.
  - [Foundry](https://sketchfab.com/3d-models/none-1365d52f9a004802a4a064dc71f3d5b9), CC Attribution-ShareAlike, about 833k faces, photogrammetry.
  - Some Sketchfab models carry a `noai` tag (seen on unrelated results). None of the five above showed it in the first six tags returned, but check the model page before use.
- **NVIDIA Isaac Sim environments.** Warehouses exist (`/Isaac/Environments/Simple_Warehouse/full_warehouse.usd`, `.../Digital_Twin_Warehouse/small_warehouse_digital_twin.usd`), plus Hospital and Office; **no factory or process-plant environment is listed** ([environment assets](https://docs.isaacsim.omniverse.nvidia.com/latest/assets/usd_assets_environments.html)). Assets fall under the [Isaac Sim Additional Software and Materials License](https://www.nvidia.com/en-us/agreements/enterprise-software/isaac-sim-additional-software-and-materials-license/): no modifying, no distributing, use only for the licensed purpose on NVIDIA-GPU systems. The [licence FAQ](https://docs.isaacsim.omniverse.nvidia.com/latest/common/license-faq.html) says selling outputs such as "simulation videos, analytic reports, or datasets" needs no enterprise licence. The licence text itself does not address outputs. Needs an NVIDIA RTX machine. Poor fit: wrong content, heavier tooling, unclear output rights.
- **Unreal "Factory Environment Collection".** It exists as a free Epic release (I found the blog URL and a Fab listing through search), but the [Epic blog post](https://www.unrealengine.com/en-US/blog/free-factory-environment-collection-now-available) returned HTTP 403, so I could not read its licence. Epic-published content is commonly restricted to use with Unreal Engine; **unverified here**. Do not use it until the Fab listing's licence is read.
- **Unity sample scenes:** not checked.
- **Blender demo files** ([list](https://www.blender.org/download/demo-files/)): no industrial or factory scene. Interiors are Classroom (CC0), Italian Flat (CC-BY), Barbershop (CC-BY).

### 5.4 Open datasets of real industrial scenes

- **ETH3D** high-res multi-view ([datasets](https://www.eth3d.net/datasets)): includes "pipes" (14 images, indoors), "delivery area" (44 images, indoors) and "electro" (45 images, outdoors), with DSLR JPGs and laser scans. I could not find the licence on the page. A secondary source lists it as CC BY-NC-SA, which would rule out commercial use; **unverified**.
- I did not find, and did not verify, any openly licensed Gaussian-splat capture of a working plant. Not finding one in this search is not evidence that none exists.

---

## 6. Alternatives to Marble

| Approach                           | Inputs needed                                                                                                                                                                   | Cost                                                                                                                                                                                                                                                              | Output                                                                                                                                                                                                 | Works in the same web viewer?                                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scaniverse** (Niantic)           | Phone capture on iOS or Android; also 360° camera and drone data                                                                                                                | Price not stated on the page I could load                                                                                                                                                                                                                         | "Standard 3D formats - including our open-source SPZ format, reducing file size by 90%"; splats "processed efficiently on-device" ([Niantic Spatial](https://www.nianticspatial.com/products/capture)) | Yes, SPZ loads in Spark. PLY export and the free tier are **unverified** (the old scaniverse.com/spz page now redirects).                                                                   |
| **Polycam**                        | 20 to 200 images, or mp4 video ([tool page](https://poly.cam/tools/gaussian-splatting)). Per capture: Free 150 images / 3 min video; Basic 300 / 5 min; Business 2,000 / 30 min | Free $0; Basic $150/year or $30/month; Business $400/year per user ([pricing](https://poly.cam/pricing))                                                                                                                                                          | Splat PLY export exists per Polycam help articles; which plan includes it is **unverified**                                                                                                            | Yes if PLY is exported.                                                                                                                                                                     |
| **Postshot** (Jawset)              | Images or video; desktop app with local NVIDIA GPU (current minimum spec **unverified**)                                                                                        | Free plan is non-commercial and exports only camera poses and points. Indie adds commercial use and "Export Radiance Fields in PLY, SPZ formats". Prices showed as €0.00 on the page I loaded, so **unverified** ([pricing](https://www.jawset.com/shop/pricing)) | PLY (lossless), SPZ v4 or v3, self-contained HTML ([export docs](https://www.jawset.com/docs/d/Postshot+User+Guide/Interface/Radiance+Field+Export))                                                   | Yes. If Spark rejects SPZ v4, use v3 or PLY (**Inference**).                                                                                                                                |
| **nerfstudio Splatfacto / gsplat** | Overlapping sharp images or video; COLMAP and FFmpeg; 360 video supported                                                                                                       | Free software. GPU memory about 6 GB (`splatfacto`) or about 12 GB (`splatfacto-big`) ([docs](https://docs.nerf.studio/nerfology/methods/splat.html))                                                                                                             | `.ply` through `ns-export gaussian-splat`                                                                                                                                                              | Yes, PLY.                                                                                                                                                                                   |
| **Luma**                           | Not verified. I could not load Luma's own capture or export docs.                                                                                                               | Not verified                                                                                                                                                                                                                                                      | Not verified                                                                                                                                                                                           | Not verified                                                                                                                                                                                |
| **Conventional 3D in three.js**    | A glTF/GLB factory mesh (section 5.3) or CAD export                                                                                                                             | Free with CC-BY assets                                                                                                                                                                                                                                            | Triangle mesh                                                                                                                                                                                          | Yes, plain three.js `GLTFLoader`. No splat renderer needed, and Spark can mix meshes and splats ("fuse splat and mesh-based objects", [Spark README](https://github.com/sparkjsdev/spark)). |

**Fit for "walkable plant + anchored annotations + agents" (Inference):**

- **Real capture + splatting** fits the product best in the long run: it is the customer's actual plant, the scale is real, and the space is as large as the capture. It fails the MVP constraint of no plant access. It also produces no collider mesh on its own; Polycam's help suggests exporting a GLTF mesh for collisions, and World Labs offers a [Collider Builder](https://www.worldlabs.ai/labs/showcase/collider-builder) tool for `.spz` scenes.
- **Conventional 3D** is the safest technically (exact collisions, exact anchors, unlimited size, navmesh-friendly for agents) and costs nothing. It does not test whether a generated world is good enough.
- **Marble** is the only option that needs no plant access and no 3D modelling, and returns splat plus collider plus metric scale in about 5 minutes. Its weakness is size and the fact that everything beyond the panorama is invented.

Because all three produce assets that load into one three.js scene, the viewer, pins and agents can be built once and the world source swapped later.

---

## 7. Web rendering requirements

### 7.1 Which library

- **`@mkkellogg/gaussian-splats-3d`** (what reference uses, `^0.4.7`): latest release v0.4.7, published 2025-01-25; last push to the repo 2025-10-19; MIT ([repo](https://github.com/mkkellogg/GaussianSplats3D)). The README states: "this repo is no longer in active development ... I recommend checking out Spark as an alternative". The README lists `.ply`, `.splat` and `.ksplat` only, but the source has an SPZ loader (`src/loaders/spz`, `SceneFormat.Spz`), which is what reference's `useGaussianSplatViewer.ts` relies on. Known issues listed: CPU splat sort with artifacts on fast movement, "sub-optimal performance on mobile devices", and scenes with very large dimensions "will probably crash".
- **Spark** (`@sparkjsdev/spark`): v2.3.1 published 2026-10-01, last push 2026-10-07, MIT, "Built by World Labs" ([repo](https://github.com/sparkjsdev/spark)). World Labs calls it "the recommended way to render World Labs splat assets in the browser" ([Tools & examples](https://docs.worldlabs.ai/api/examples)) and says "It is also what our own website is built off of" ([Exporting to dev frameworks](https://docs.worldlabs.ai/marble/export/gaussian-splat/spark)). Formats: PLY, SPZ, SPLAT, KSPLAT, SOG. PLY and SPZ are auto-detected from file contents ([loading splats](https://sparkjs.dev/docs/loading-splats/)).

**Recommendation:** use Spark for new work. reference's library still loads SPZ but is unmaintained by its author's own statement.

### 7.2 three.js integration

**Verified** from the [Spark README](https://github.com/sparkjsdev/spark): create a `THREE.WebGLRenderer`, add `new SparkRenderer({ renderer })` to the scene, then add `new SplatMesh({ url })` like any `Object3D`. The README example re-orients with `quaternion.set(1, 0, 0, 0)` (a 180° turn about X), which the Spark docs label "Re-orient from OpenCV to OpenGL coordinates" and which matches what Marble's own viewer does (section 3.4). Splats and ordinary meshes render together, so pins and agent avatars can be normal three.js objects.

### 7.3 Performance

**Verified** from [Spark performance tuning](https://sparkjs.dev/docs/performance/) and [Spark LoD](https://sparkjs.dev/docs/lod-getting-started/):

- Splat budgets: Quest 3 "1 million splats or less"; Android phone 1 to 2 million; iPhone 1 to 3 million; computer 1 to 5 million (10 to 20+ million on some desktops).
- Level of detail: `new SplatMesh({ url, lod: true })` builds a LoD tree in a worker, taking 1 to 3 seconds per million input splats, and supports "up to 30M or so input splats". Default LoD budgets: 500K Oculus, 750K Vision Pro, 1M Android, 1.5M iOS, 2.5M desktop. A pre-built `.RAD` file avoids the build step and can be streamed with `paged: true`.
- Keep `antialias: false` on the WebGL renderer; consider whether high device pixel ratio is worth it.

**Inference:** one Marble world at `full_res` (about 2M splats) is within the desktop budget without LoD. Serve the `500k` SPZ to phones. Three composed worlds (about 6M) should use `lod: true`.

### 7.4 Walking and collision

- World Labs' pattern is splat for visuals plus collider GLB for physics: "You can export collider mesh along with a splat to provide simple physics for games" ([Mesh export](https://docs.worldlabs.ai/marble/export/mesh)).
- Reference implementations linked from [Interactive world examples](https://docs.worldlabs.ai/api/interactive-world-examples):
  - [bmild/spark-physics](https://github.com/bmild/spark-physics) (MIT): Spark + Rapier + three.js, pointer-lock WASD, and a debug toggle between the splat and the collision wireframe.
  - [icurtis1/gaussian-splat-character-controller](https://github.com/icurtis1/gaussian-splat-character-controller) (MIT): first-person controller with collision, jumping, gamepad.
  - [icurtis1/third-person-controller-splat](https://github.com/icurtis1/third-person-controller-splat) (licence not checked): Spark 2.0 LoD with a kinematic controller and collider mesh support.
- **Inference for pins and agents:** load the collider GLB with `GLTFLoader`, apply the same transform as the splat (axis flip, then `metric_scale_factor`, then `ground_plane_offset`), build a Rapier trimesh from it, and raycast against it to place finding pins on surfaces and keep agents on the floor. reference flies freely with WASD and no collision, so this step is optional for a first demo.

---

## 8. Domain realism

### 8.1 What a small-to-medium plant floor contains

The most authoritative short list I found is OSHA's process safety standard, whose mechanical-integrity paragraph names the equipment that must be inspected. **Verified** from [29 CFR 1910.119(j)(1)](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.119):

- "Pressure vessels and storage tanks"
- "Piping systems (including piping components such as valves)"
- "Relief and vent systems and devices"
- "Emergency shutdown systems"
- "Controls (including monitoring devices and sensors, alarms, and interlocks)"
- "Pumps"

For discrete manufacturing, [29 CFR 1910.212(a)(1)](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.212) describes machines with a "point of operation, ingoing nip points, rotating parts, flying chips and sparks", and [1910.178](https://www.osha.gov/top10citedstandards) covers powered industrial trucks (forklifts).

**Inference (general engineering knowledge, not from a cited source):** a credible prompt or footage choice would also show compressors, heat exchangers, pipe racks, motor control centres and electrical panels, conveyors, CNC machines, overhead cranes, marked walkways, guardrails, fire extinguishers and safety signage. The Boiler Room panorama covers piping, valves, gauges, pumps and control cabinets; the Foundry panorama covers cranes, marked walkways and workstations.

Suggested text prompt for the fallback (**Inference**, under the 2,000 character limit): "Interior of a small process plant hall. Rows of centrifugal pumps on concrete plinths, vertical pressure vessels and storage tanks, colour-coded pipework with handwheel valves and pressure gauges on an overhead pipe rack, a shell-and-tube heat exchanger, grey electrical control cabinets, yellow-painted walkways and guardrails, safety signs, fluorescent lighting, clean concrete floor, no people."

### 8.2 Findings such a tool could plausibly annotate

OSHA's most frequently cited standards for fiscal year 2026 (2025-10-01 to 2026-08-31, preliminary) include, for general industry: Hazard Communication (1910.1200), Lockout/Tagout (1910.147), Respiratory Protection (1910.134), Powered Industrial Trucks (1910.178) and Machine Guarding (1910.212) ([OSHA top 10](https://www.osha.gov/top10citedstandards)).

Visually checkable findings, each tied to a standard (**Verified** quotes):

| Finding to pin                                                                          | Source                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing or inadequate machine guard on a point of operation, nip point or rotating part | [1910.212(a)(1)](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.212): "One or more methods of machine guarding shall be provided"                                          |
| Leak, spill, corrosion, or protruding object on a walkway                               | [1910.22(a)(3)](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.22): surfaces "free of hazards such as sharp or protruding objects, loose boards, corrosion, leaks, spills" |
| Poor housekeeping in passageways                                                        | [1910.22(a)(1)](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.22): kept "in a clean, orderly, and sanitary condition"                                                     |
| Blocked exit route                                                                      | [1910.37(a)(3)](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.37): "Exit routes must be free and unobstructed."                                                           |
| Missing or unlit exit sign                                                              | [1910.37(b)(2), (b)(6)](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.37): each exit "marked by a sign reading 'Exit'"                                                    |
| Overdue inspection on a vessel, tank, pipe, valve, relief device or pump                | [1910.119(j)(4)(i)](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.119): "Inspections and tests shall be performed on process equipment."                                  |

**Inference:** lockout/tagout, hazard-communication labelling and forklift traffic are also natural pin categories given the top-10 list, but I did not read those standards' text. A generated world has no real defects, so MVP findings would be authored or model-suggested.

HSE (UK): the [PUWER page](https://www.hse.gov.uk/work-equipment-machinery/puwer.htm) loaded only as an index without the requirements, so no HSE claim is made here.

---

## 9. Open questions / unverified

1. **Physical size of a `marble-1.1-plus` world.** No source gives metres or compares it to a corridor-scale scene. Only a test will show whether one world is enough.
2. **How reference got its corridor.** Its code sends up to 8 walkthrough frames as `multi-image` with `reconstruct_images: true` and no `model`, so it used the default model of the time. I did not verify what its demo world was generated from.
3. **Default model conflict** between the API models page (`marble-1.0`) and the OpenAPI spec (`marble-1.1`).
4. **Coordinate convention conflict** between release notes (OpenGL since 2025-12-11) and the SPZ rendering page (`marble_raw_opencv`).
5. **Credit cost of `pano:depth_to_rgb`.** Not in the pricing table.
6. **Marble web app pricing.** [marble.worldlabs.ai/pricing](https://marble.worldlabs.ai/pricing) rendered no content. The docs give Standard as $20/month with 20,000 credits and Pro as $35/month; other figures unread. Which plan Studio Compose needs is not stated.
7. **How long API asset URLs stay valid**, and the caching duration the Terms refer to. Plan to copy the SPZ and GLB to your own storage, as reference does, but check the terms question first.
8. **SPZ version of API output.** Studio exports SPZ v2 by default (v3 opt-in) per release notes; the API's version is not stated.
9. **Video container formats** differ across three World Labs pages.
10. **Unreal Factory Environment Collection licence** (page returned 403). **Unity** sample scenes not checked.
11. **ETH3D licence** not found on its page.
12. **Sketchfab models** not opened; licences are as reported by the Sketchfab API. Sketchfab's own description of CC licences and any AI restriction was not found on the page I loaded.
13. **Stock video.** No specific Pexels, Pixabay, Mixkit or Coverr factory clip was verified. Internet Archive and CC-licensed YouTube were not searched.
14. **Postshot prices**, **Polycam splat export tier**, **Scaniverse price and PLY export**, and everything about **Luma**.
15. **Whether a generated world is a derivative work** of a CC BY or CC BY-SA input. Avoided by using CC0.
16. **3DGS paper wording.** Read through an automated summary of the ar5iv copy; quotes are fragments, the rest is paraphrase.
17. **Poly Haven panoramas not viewed**: Pump House, Machine Shop 01 and 03, Vintage Measuring Lab, Aerodynamics Workshop, Peppermint Powerplant 2, Distribution Board.

---

## 10. Sources

World Labs

- https://docs.worldlabs.ai/llms.txt
- https://docs.worldlabs.ai/marble/models
- https://docs.worldlabs.ai/marble/release-notes
- https://docs.worldlabs.ai/marble/create/prompt-guides
- https://docs.worldlabs.ai/marble/create/prompt-guides/image-prompt
- https://docs.worldlabs.ai/marble/create/prompt-guides/multi-image-prompt
- https://docs.worldlabs.ai/marble/create/prompt-guides/pano-prompt
- https://docs.worldlabs.ai/marble/create/prompt-guides/video-prompt
- https://docs.worldlabs.ai/marble/create/prompt-guides/expand
- https://docs.worldlabs.ai/marble/create/chisel-tools/chisel-basics
- https://docs.worldlabs.ai/marble/create/studio-tools/compose
- https://docs.worldlabs.ai/marble/export/specs
- https://docs.worldlabs.ai/marble/export/mesh
- https://docs.worldlabs.ai/marble/export/gaussian-splat/spark
- https://docs.worldlabs.ai/marble/support/account-billing
- https://docs.worldlabs.ai/api
- https://docs.worldlabs.ai/api/models
- https://docs.worldlabs.ai/api/pricing
- https://docs.worldlabs.ai/api/rate-limits
- https://docs.worldlabs.ai/api/faq
- https://docs.worldlabs.ai/api/errors
- https://docs.worldlabs.ai/api/world-generation-examples
- https://docs.worldlabs.ai/api/examples
- https://docs.worldlabs.ai/api/rendering-spz
- https://docs.worldlabs.ai/api/interactive-world-examples
- https://docs.worldlabs.ai/api/reference/worlds/export
- https://docs.worldlabs.ai/api/reference/pano/depth_to_rgb
- https://docs.worldlabs.ai/api/reference/openapi.yaml
- https://docs.worldlabs.ai/terms-of-service
- https://www.worldlabs.ai/blog/marble-world-model
- https://marble.worldlabs.ai/pricing (did not render)
- https://github.com/worldlabsai/worldlabs-api-examples

Rendering

- https://github.com/sparkjsdev/spark
- https://sparkjs.dev/docs/
- https://sparkjs.dev/docs/performance/
- https://sparkjs.dev/docs/lod-getting-started/
- https://sparkjs.dev/docs/loading-splats/
- https://github.com/mkkellogg/GaussianSplats3D
- https://github.com/bmild/spark-physics
- https://github.com/icurtis1/gaussian-splat-character-controller
- https://github.com/icurtis1/third-person-controller-splat

Input candidates and licences

- https://polyhaven.com/license
- https://api.polyhaven.com/assets?t=hdris
- https://polyhaven.com/a/boiler_room
- https://polyhaven.com/a/machine_shop_02
- https://polyhaven.com/a/industrial_workshop_foundry
- https://polyhaven.com/a/industrial_pipe_and_valve_01
- https://polyhaven.com/a/pump_house
- https://polyhaven.com/a/machine_shop_01
- https://polyhaven.com/a/machine_shop_03
- https://polyhaven.com/a/vintage_measuring_lab
- https://polyhaven.com/a/aerodynamics_workshop
- https://polyhaven.com/a/peppermint_powerplant_2
- https://polyhaven.com/a/distribution_board
- https://commons.wikimedia.org/wiki/File:Zeche_Erin_Schacht3_Panorama_04.jpg
- https://commons.wikimedia.org/wiki/File:Chernobyl_Nuclear_Power_Plant-_Unit_3_Main_Circulation_Pumps.webm
- https://commons.wikimedia.org/wiki/File:The_winding_machine_at_G%C3%B6teborgs_Remfabrik.webm
- https://www.pexels.com/license/
- https://pixabay.com/service/license-summary/
- https://mixkit.co/license/ (terms not returned)
- https://api.sketchfab.com/v3/search
- https://sketchfab.com/3d-models/none-ec811076214648928567173c773e8da6
- https://sketchfab.com/3d-models/none-b7866279b7224c48a31b85fe7cedae59
- https://sketchfab.com/3d-models/none-647a6eb8ef0049de892cfacd79221c3a
- https://sketchfab.com/3d-models/none-43e391b59f8c41118877ecb1d06b2e40
- https://sketchfab.com/3d-models/none-1365d52f9a004802a4a064dc71f3d5b9
- https://docs.isaacsim.omniverse.nvidia.com/latest/assets/usd_assets_environments.html
- https://docs.isaacsim.omniverse.nvidia.com/latest/common/license-faq.html
- https://www.nvidia.com/en-us/agreements/enterprise-software/isaac-sim-additional-software-and-materials-license/
- https://www.unrealengine.com/en-US/blog/free-factory-environment-collection-now-available (HTTP 403)
- https://www.blender.org/download/demo-files/
- https://www.eth3d.net/datasets

Splatting alternatives

- https://ar5iv.labs.arxiv.org/html/2308.04079
- https://docs.nerf.studio/quickstart/custom_dataset.html
- https://docs.nerf.studio/nerfology/methods/splat.html
- https://poly.cam/tools/gaussian-splatting
- https://poly.cam/pricing
- https://www.jawset.com/shop/pricing
- https://www.jawset.com/docs/d/Postshot+User+Guide/Interface/Radiance+Field+Export
- https://www.nianticspatial.com/products/capture

Domain

- https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.119
- https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.212
- https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.22
- https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.37
- https://www.osha.gov/top10citedstandards
- https://www.hse.gov.uk/work-equipment-machinery/puwer.htm (index only)

Local code read for context

- `C:\Users\Lenovo\ada-twin\packages\world\src\types.ts`, `prompt.ts`, `assets.ts`
