# Final step: applied-changes report and Nano Banana photo edits

Research notes for a new last project step, after "Apply to my twin" on `/p/:id/results`. All sources were read on **2026-10-17**. **Verified** means the statement comes straight from the cited source: a Google doc, the installed SDK, or a repo file at `path:line`. **Inference** means my own reasoning, not yet tested. No model was called, no server was started or contacted, and no code was changed.

---

## 1. Recommendation

| Decision           | Recommendation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New step           | Add `{ slug: "outcome", label: "Outcome" }` (name open) after `results` in `STEPS` (`apps/frontend/src/lib/projects.ts:8-18`). Add a lazy route next to the others (`apps/frontend/src/main.tsx:19-25`). Have `applyRedesign` write a snapshot, then `navigate(path("outcome"))`. Leave the existing Results report alone.                                                                                                                                                                                                                                                                                        |
| Snapshot           | Before `applyRedesign` clears `kept` and `history` (`apps/frontend/src/pages/steps/results.tsx:583-591`), write an `AppliedRedesign` JSON record under a new key, `twin-applied`. It is small and has no events, so localStorage is fine. Store images in IndexedDB, not localStorage.                                                                                                                                                                                                                                                                                                                    |
| Ranking            | Rank by **leave-one-out marginal gain** on the combined redesign: `kpis(all) − kpis(all minus i)`, using the existing `measure()`. Then assign tiers by scenario target: whether removing the change makes a target fail. Break ties with the change's link to the baseline bottleneck and with cost per part. To avoid ranking on one lucky seed, average over a few days with `simulateDays`/`averageKpis`.                                                                                                                                                                                                                                                                                  |
| Image model        | Default to `gemini-nano-banana-2.1` (GA 2026-10-06, $0.034 per 1K image and $0.05 per 2K image). Offer `gemini-3-pro-image` ("Nano Banana Pro", $0.134 per 1K or 2K image) as a quality switch through an env var. Both serve only the `global` location on Vertex AI, which is the repo default.                                                                                                                                                                                                                                                                                                                      |
| What gets edited   | Edit **perspective views** cut from the equirectangular panorama and centred on each change's pin, not the whole 2:1 panorama, because no Nano Banana model offers a 2:1 output. Show each before/after pair side by side or with a slider. Pasting edits back into the 360° panorama is a stretch goal.                                                                                                                                                                                                                                                                                                                            |
| Pointing the model | No model supports a pixel mask. Imagen's mask editing endpoints are deprecated. So: (1) centre the view on the pin; (2) name the equipment and its position in the prompt, using Google's "semantic masking" template; (3) optionally send a second copy of the view with the target area outlined; (4) optionally blend the result back into the original outside a feathered client-side mask, so untouched areas stay pixel-identical.                                                                                                                                                                                                                  |
| Chat               | Keep each image's conversation stateless on the server. The browser keeps the turns and sends back the latest model turn, image part and `thoughtSignature` included, plus the original view and a compact text history. Do not resend every earlier image.                                                                                                                                                                                                                                                                                                                                                                                    |
| Labelling          | Put a persistent "Illustration, not an engineering drawing" badge on every edited image. Mention the SynthID watermark and C2PA. Never show an edited image without its original next to it.                                                                                                                                                                                                                                                                                                                                                                                                                                       |

---

## 2. What the repo has today

### 2.1 Steps, routing and per-project state

- **Verified.** Steps come from one `STEPS` array: capture, twin, scenario, agents, results (`apps/frontend/src/lib/projects.ts:8-18`). Each step is a lazy route (`apps/frontend/src/main.tsx:19-25,48-58`). The old `run`, `report` and `redesign` paths redirect to `results` (`main.tsx:52-56`). A project's progress is the index of the furthest step reached (`projects.ts:31-32`, `visitStep` at `projects.ts:94-99`).
- **Verified.** Per-project values sit in localStorage under `ada-twin:project:<id>:<key>` (`projects.ts:122-124`), read and written through `useStored` (`apps/frontend/src/twin/project.ts:273-302`). A failed write is silently ignored (`project.ts:291-295`, `apps/frontend/src/lib/storage.ts:12-18`). Deleting a project removes every key with that prefix (`projects.ts:104-119`).
- **Verified.** The keys are listed at `project.ts:17-27`: `twin-machines`, `twin-scenario`, `twin-agents`, `twin-run`, `twin-accepted` (kept changes), `twin-costs`, `twin-redesign-history` and `twin-design-chat`.

### 2.2 What "Apply to my twin" does

- **Verified.** `applyRedesign()` calls `applyToTwin({ machines, flow, scenario }, kept)`, saves the new machines, flow and scenario, then runs `setKept([])`, `setHistory([])` and `setView("baseline")` (`results.tsx:583-591`). The button shows only while there are kept changes and no live run (`results.tsx:891-899`).
- **Verified.** `applyToTwin` turns each `GraphDiff` into a change to the saved twin (`apps/frontend/src/twin/recommend.ts:163-251`):
  - `add-units` raises `count`.
  - `add-spare` raises `count` and `spares`.
  - `insert-buffer` adds a buffer extra, splits the link and places it at the link's midpoint in the flow diagram.
  - `resize-buffer` changes the extra's `value`.
  - `set-param` writes the station parameter.
  - `extraCrews` is added to `scenario.maintenanceCrews`.
- **Verified.** The stored run (`twin-run`) is **not** cleared. It still describes the pre-change graph (`StoredRun.graph`, `project.ts:249-265`).
- **Consequence (Inference).** After Apply, three things are lost:
  - which changes were applied;
  - what each one gained;
  - the combined KPIs.

  The cost estimates survive in `twin-costs`, keyed by `currency:title` (`apps/frontend/src/results/format.ts:7-8`). The new page needs a snapshot written **before** the clear.

### 2.3 What can be measured

- **Verified.** `measure(run, changes)` re-runs the shift with the run's seed on standard rules. It applies the scenario, then the diffs, and adds the extra crews (`recommend.ts:44-63`).
- **Verified.** `measureChanges` ranks the *proposed* changes by solo gain in completed parts (`recommend.ts:150-160`). The page also measures each kept change on its own (`alone`, `results.tsx:392-411`) and the set as a whole (`results.tsx:368-389`).
- **Verified.** `Kpis` has these fields (`packages/sim/src/kpi.ts:12-47`):
  - `completed`, `scrapped`, `throughputPerHour`, `averageWip` and `bottleneck`;
  - per station: `utilisation`, `blocked`, `down`, `stopped`, `stoppedBy` and `idle`;
  - per support: `down`.
- **Verified.** `Scenario.targets` holds `throughputPerShift`, `maxAverageWip` and `maxDownShare` (`packages/sim/src/scenario.ts:13-30`). The API already turns them into a goal sentence (`apps/api/src/routes/run.ts:89-101`).
- **Verified.** `simulateDays(graph, config, days)` replays the shift on consecutive seeds, and `averageKpis` averages the results (`packages/sim/src/days.ts:29,86-100`). The frontend does not use either yet; `grep` found no callers in `apps/frontend/src`.
- **Verified.** Cost estimates include `oneOff` and `yearly` ranges, a `basis` and `sources` (`packages/agent/src/agents/cost-estimator.ts:15-32`). `perPart(estimate, gain)` gives one-off cost per part per shift gained (`format.ts:25-29`).

### 2.4 The panorama: what image assets exist (important gap)

- **Verified.** The only panorama that is stored is **one global file**, `/worlds/current/pano.png`, under `apps/frontend/public/worlds/current/`. Every project shares it (`WORLD_DIR`, `project.ts:29-30`). It is gitignored (`apps/frontend/.gitignore`: `/public/worlds/`).
- **Verified.** `scripts/src/fetch-world.ts:63` writes it from World Labs' `assets.imagery.pano_url`, alongside `world.json`, `world.spz`, `world-full.spz` and `collider.glb` (`fetch-world.ts:47-61`).
- **Verified (local file).** The file here is a **PNG, 4608×2304, RGB, 13.9 MB** (`file`/`ls -la` on `apps/frontend/public/worlds/current/pano.png`). That is about 12.8 px per degree of yaw (**Inference**: 4608 / 360).
- **Verified.** The Capture step's uploads are **not persisted**:
  - They live in React state as `URL.createObjectURL` previews (`apps/frontend/src/pages/steps/capture.tsx:55-81,385`).
  - The previews are revoked on unmount (`capture.tsx:394-399`).
  - Nothing sends them to the API or stores them.

  Capture accepts JPEG, PNG or WebP up to 20 MB and flags anything that is not 2:1 (`capture.tsx:34-35,69-77`). Only the process description persists (`useStored(PROCESS_KEY)`, `capture.tsx:386`).
- **Verified.** Every AI step that reads the photo sends a **URL** to the API, `${window.location.origin}/worlds/current/pano.png` (`apps/frontend/src/pages/steps/twin.tsx:394,529,648`). The API fetches it server side (`apps/api/src/routes/twin.ts:65-100`).
- **Verified.** The server already cuts perspective views out of the equirectangular image: `splitPanorama` (eight 90° views at −15° pitch, 1024 px, JPEG q85), `viewDirection` and `panoramaPoint` (`packages/agent/src/panorama-views.ts:24-31,43-80,141-178`). They decode with `pngjs` and `jpeg-js` (`panorama-views.ts:93-108`).
- **Verified.** Machines carry `pins?: Point[]`, which are 3D points in the splat's frame (`project.ts:36-40`). They come from two places:
  - The locator gives panorama `uv` points; `castFromPanorama` raycasts each onto the collider from the world origin (`twin.tsx:655-664`, `apps/frontend/src/components/viewer/WorldView.tsx:107-123`).
  - The user clicks in the viewer (`twin.tsx:716-722`).

  Only the 3D pin is saved, not the `uv`.
- **Verified.** "The panorama was shot from the world origin" (`WorldView.tsx:114`). The equirectangular mapping is in `panoDirection` (`apps/frontend/src/components/viewer/colliderRaycast.ts:45-65`). The splat frame is Y-down (`apps/frontend/src/components/viewer/useSplatViewer.ts:43-44`).
- **Inference.** A pin's panorama position is therefore recoverable as `u = 0.5 + atan2(x, z)/2π` and `v = 0.5 − asin(−y/|p|)/π`, inverting `panoDirection`. Calibration with `yawDegrees` and `mirror` defaults to 0 and false. Buffers have flow positions only, never pins (`recommend.ts:203-214`).

**Implication.** "The plant's panorama photos" means one image today, `pano.png`. Storing the user's own panoramas per project is a separate prerequisite (§8, decision D1).

### 2.5 The 3D viewer and screenshots

- **Verified.** `WorldView` renders a Gaussian splat with `@mkkellogg/gaussian-splats-3d` 0.4.7 on three 0.174.0 (`apps/frontend/package.json:18,31`) from a ceiling "rail" camera (`WorldView.tsx:64-74`).
- **Verified.** The library creates its own `THREE.WebGLRenderer({ antialias: false, precision: 'highp' })` without `preserveDrawingBuffer` (`node_modules/@mkkellogg/gaussian-splats-3d/build/gaussian-splats-3d.module.js:12564-12567`). It accepts an external `renderer` option (`...module.js:12295,12491`).
- **Inference.** You could screenshot a view in two ways:
  - Pass your own renderer with `preserveDrawingBuffer: true`.
  - Call `renderer.render()` and then `canvas.toDataURL()` in the same frame.

  The splat is a *reconstruction*, though. It is softer than the source photo and comes from the ceiling camera, not the panorama's viewpoint. Cropping `pano.png` directly gives sharper input with exact geometry. Use the viewer for *context*, such as flying to the pin and showing the panorama crop beside it, not as the image you edit.

### 2.6 AI plumbing

- **Verified.** `@repo/agent` depends on `@google/genai` `^2.28.0`; version 2.28.0 is installed (`packages/agent/package.json`, `packages/agent/node_modules/@google/genai/package.json`).
- **Verified.** `createGeminiModel` builds `new GoogleGenAI({ vertexai: true, project, location })` with 429 retries (`packages/agent/src/model.ts:66-80`).
  - The location defaults to `global` (`model.ts:8`).
  - Env keys: `GOOGLE_CLOUD_PROJECT` (required), `GOOGLE_CLOUD_LOCATION`, `GEMINI_MODEL` (`model.ts:15-25,81`).
  - Auth is Application Default Credentials (`model.ts:10-14`).
- **Verified.** `AskModel` returns text only and forces `responseMimeType: "application/json"` when search is off (`model.ts:104-108`). It cannot return images, so image editing needs a sibling function.
- **Verified.** `apps/api/.env.example` lists `PORT`, `WORLD_LABS_API_KEY`, `WORLD_LABS_API_BASE`, `GEMINI_API_KEY`, `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION`. No TypeScript in the repo reads `GEMINI_API_KEY`, so everything goes through Vertex AI. `deploy.mjs:71` sets `GOOGLE_CLOUD_LOCATION` to `global` by default.
- **Verified.** CORS: `WEB_ORIGIN` is a comma-separated list, falling back to `http://localhost:3000` and `http://localhost:3067` (`apps/api/src/index.ts:9-16`). The API is deployed public on Cloud Run with `--timeout=3600` (`deploy/deploy.mjs:64`, `deploy/README.md:103`).
- **Verified.** There is no body-limit middleware. `apps/api/src/index.ts` registers only `cors`. Hono 4.13.12 ships `hono/body-limit` but it is not used.

---

## 3. Nano Banana: models, availability, limits, price

### 3.1 Model ids (Vertex AI, now branded "Gemini Enterprise Agent Platform")

| Model id                      | Name                         | Status / dates                                         | Locations                                                     | Max input images | Resolutions        | Price per output image (Vertex, Standard, global)                    |
| ----------------------------- | ---------------------------- | ------------------------------------------------------ | ------------------------------------------------------------- | ---------------- | ------------------ | --------------------------------------------------------------------- |
| `gemini-nano-banana-2.1`      | Nano Banana 2.1              | GA, released 2026-10-06                                | `global` only                                                 | 14               | 1K, 2K, 4K         | $0.034 1K, $0.05 2K, $0.113 4K. Input $1.50/M tokens, 1,120 tokens per input image |
| `gemini-3.1-flash-image`      | Nano Banana 2                | GA 2026-05-28, retires 2027-05-28 or later             | `global`, multi-region `us`, `eu`                             | 14               | 512, 1K, 2K, 4K    | $0.045 512, $0.067 1K, $0.101 2K, $0.15 4K                            |
| `gemini-3.1-flash-lite-image` | Nano Banana 2 Lite           | GA 2026-06-23                                          | `global` only                                                 | 14               | 1K only            | $0.034 1K                                                             |
| `gemini-3-pro-image`          | Nano Banana Pro              | GA 2026-05-28, retires 2027-05-28 or later             | `global` only                                                 | 14               | 1K, 2K, 4K         | $0.134 1K or 2K, $0.24 4K. Input $2.00/M tokens, 560 tokens per input image |
| `gemini-2.5-flash-image`      | Nano Banana (legacy)         | GA 2025-10-02, **retires 2027-03-15**                  | `global` plus many regions                                    | 3                | (not stated)       | Image output $30/M tokens                                             |

Sources:

- Model spec pages, all "Last updated 2026-10-16":
  - [Nano Banana 2.1](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/nano-banana-2-1)
  - [3.1 Flash Image](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-image)
  - [3.1 Flash-Lite Image](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-lite-image)
  - [3 Pro Image](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-pro-image)
  - [2.5 Flash Image](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/2-5-flash-image)
- [Vertex pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing), "Nano Banana" table and its footnotes [1] to [4].

**Verified** extra points:

- **Discounts.** Flex/Batch prices are half: Nano Banana 2.1 image output is $15/M versus $30/M. Nano Banana 2.1 does not support Flex. Priority costs about 1.8× ([pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing)).
- **Gemini Developer API.** The same ids are listed on ai.google.dev. `gemini-nano-banana-2.1` has **no free tier** and costs $0.0336 per 1K image and $0.0504 per 2K image ([Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)). The repo does not use the Developer API (§2.6).
- **Interactions API.** The Developer API docs now show image examples on the **Interactions API** (`ai.interactions.create`, `response_format`, `previous_interaction_id`) ([ai.google.dev image generation](https://ai.google.dev/gemini-api/docs/image-generation)). On Vertex, `gemini-3-pro-image` lists **GenerateContent** as supported and **Interactions (preview)** as *not* supported ([3 Pro Image spec](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-pro-image)). **Use `generateContent`**, which the repo already uses.
- **Unsupported parameters.** Nano Banana 2.1 rejects `seed`, `topK`, `logprobs`, `temperature` and `topP`: "Setting any of these returns an API error" ([2.1 spec](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/nano-banana-2-1)). Do not reuse a config that sets them.
- **Thinking.** It cannot be turned off on Gemini 3 image models. Thought tokens are billed, but interim "thought images" are not charged ([ai.google.dev image generation](https://ai.google.dev/gemini-api/docs/image-generation)).
- **Rate limits.** The spec pages list "Fixed quota: not supported" for these models, so capacity is shared pay-as-you-go and 429s can happen ([2.1 spec](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/nano-banana-2-1)). The repo already retries 429s with backoff (`model.ts:27-39,71-78`). I did not find a per-minute image figure for Vertex.

### 3.2 Aspect ratios and output sizes (no 2:1)

- **Verified.** Nano Banana 2.1, 3.1 Flash Image and 3 Pro Image support 1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, **21:9**, 9:21, 1:4, **4:1**, 1:8 and **8:1**. 2.5 Flash Image stops at 21:9 ([spec pages above](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/nano-banana-2-1)). The installed SDK's typed list matches, minus 9:21 (`ImageConfigAspectRatio`, `packages/agent/node_modules/@google/genai/dist/genai.d.ts:8655`).
- **Verified.** Pixel sizes for Nano Banana 2.1 ([ai.google.dev image generation](https://ai.google.dev/gemini-api/docs/image-generation), resolution table):

  | Ratio | 1K        | 2K        | 4K        |
  | ----- | --------- | --------- | --------- |
  | 16:9  | 1376×768  | 2752×1536 | 5504×3072 |
  | 21:9  | 1584×672  | 3168×1344 | 6336×2688 |
  | 4:1   | 2048×512  | 4096×1024 | 8192×2048 |

  Sizes need an uppercase K.
- **Verified.** "If not specified, the model will choose a default aspect ratio based on any reference images provided" (SDK `ImageConfig_2.aspect_ratio` doc, `genai.d.ts:8619-8629`).
- **Inference.** **No model offers 2:1 (equirectangular).** The nearest are 16:9 (1.78) and 21:9 (2.33). Sending the whole panorama means either the model resamples it to a different ratio, which breaks the equirectangular mapping, or you pad it.

### 3.3 Input limits and request size

- **Verified.** Inline data or console upload: 7 MB per file. Cloud Storage: 30 MB. Formats: PNG, JPEG, WebP, HEIC and HEIF ([2.1 spec](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/nano-banana-2-1)). Multi-turn editing: "Limit the entire request file size to 50 MB maximum" ([Edit images with Gemini](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/gemini-edit-images), updated 2026-10-15).
- **Verified.** `pano.png` is 13.9 MB, which is **over** the 7 MB inline limit. **Inference:** the existing `LOCATE_SPLIT=off` path (`twin.ts:103-112`) sends the whole PNG inline and probably fails or is truncated. Perspective crops as JPEG come to well under 1 MB.

### 3.4 Watermark, provenance and safety

- **Verified.** "All generated images include a SynthID watermark" ([ai.google.dev image generation](https://ai.google.dev/gemini-api/docs/image-generation)). The Vertex spec pages list **Content Credentials (C2PA)** as supported for 2.1 and 3 Pro Image.
- **Verified.** Safety blocks show up in three ways ([Gemini image generation and responsible AI](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/gemini-image-responsible-ai)):
  - a text refusal with `FinishReason` `STOP`;
  - `PromptFeedback.BlockedReason`;
  - `FinishReason` `IMAGE_SAFETY` or `IMAGE_PROHIBITED_CONTENT`, with `raiFilteredReason` support codes.

  The route must handle a reply that has **no image part**.
- **Verified.** "The model might only create text and no image if the prompt is ambiguous", and "The model might stop generating content even when it's not finished" ([limitations](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/gemini-image-generation-limitations)). Best-performing languages are listed there; English is supported.

---

## 4. How to call it with the repo's SDK

### 4.1 Single edit (generateContent)

**Verified.** This is the Node sample from [Edit images with Gemini](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/gemini-edit-images), shortened. It uses the same `vertexai: true` constructor as `model.ts:69-72`:

```ts
const response = await client.models.generateContent({
  model: "gemini-2.5-flash-image",
  contents: [{ role: "user", parts: [
    { inlineData: { mimeType: "image/png", data: imageBytes.toString("base64") } },
    { text: "Edit this image to make it look like a cartoon" },
  ]}],
  config: { responseModalities: [Modality.TEXT, Modality.IMAGE] },
});
for (const part of response.candidates[0].content.parts) {
  if (part.text) console.log(part.text);
  else if (part.inlineData) Buffer.from(part.inlineData.data, "base64");
}
```

**Verified.** In SDK 2.28.0, `ImageConfig` has these fields (`genai.d.ts:8591-8612`):

- `aspectRatio`;
- `imageSize` (`"1K" | "2K" | "4K"`, plus `"512"` per `genai.d.ts:8671`);
- `personGeneration`;
- `outputMimeType` and `outputCompressionQuality`, both "not supported in Gemini API" and so Vertex only;
- `imageOutputOptions` and `prominentPeople`.

Pass it as `config.imageConfig`.

**Inference.** The shape for this feature:

```ts
config: {
  responseModalities: [Modality.TEXT, Modality.IMAGE],
  imageConfig: { aspectRatio: "16:9", imageSize: "2K", outputMimeType: "image/jpeg", outputCompressionQuality: 90 },
  systemInstruction: "...you edit photos of an industrial plant...",
}
```

Do not set `temperature`, `topP` or `seed` (§3.1). Do not set `responseMimeType` either. A JPEG at 2752×1536 is roughly 1 to 2 MB, against roughly 6 to 10 MB for a PNG.

The REST sample on the same page nests `responseModalities` *inside* `imageConfig`. The SDK type and the other samples put it in the generation config. Follow the SDK.

### 4.2 Multi-turn editing and thought signatures

- **Verified.** All five models support multi-turn editing ([Edit images with Gemini](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/gemini-edit-images)). Google calls multi-turn "the recommended way to iterate on images" ([ai.google.dev](https://ai.google.dev/gemini-api/docs/image-generation)). 3.1 Flash-Lite is "not optimized for multi-turn sequential editing", so do not use it for the chat.
- **Verified.** "Gemini 3 models enforce stricter validation on thought signatures … If a required thought signature is not returned … the model will return a 400 error." However: "While Gemini 3 Pro Image doesn't enforce this validation … you must still return the thought signatures from previous responses." When you use the SDK's chat history, or append the full model response to history, "thought signatures are handled automatically" ([Thought signatures](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking/thought-signatures), updated 2026-10-15).
- **Verified.** Signatures can also sit on non-function-call parts such as `text` and `inlineData`. "The API does not strictly enforce validation for signatures in non-functionCall parts … performance may degrade" if you omit them (same page). Google's image example creates a chat with `client.chats.create(...)`, then sends the previous image bytes back with the new instruction (same page, "Example of multi-turn image editing using thought signatures").
- **Verified.** `Part.thoughtSignature?: string` is base64 (`genai.d.ts:12873-12876`). `ai.chats.create()` returns a `Chat` that keeps `history` in memory (`genai.d.ts:1732-1760,1815`).
- **Inference: a stateless design for this API.** Hono on Cloud Run keeps no session, and instances can scale to three (`deploy/README.md:103`), so an in-memory `Chat` cannot survive between requests. Have the browser keep each image's thread as `Content[]` and send per turn:
  1. The user turn holding the **original view** (JPEG) and a short instruction naming the change.
  2. The **latest model turn exactly as returned**: its `inlineData` image and every `thoughtSignature`, unmodified.
  3. Earlier user instructions as **text only**, condensed into one line each.
  4. The new instruction.

  That keeps each request near 3 to 5 MB, against the 50 MB limit (§3.3) and Cloud Run's 32 MiB HTTP/1 request limit (§6.1). It also avoids the cost of resending N images, about 1,120 input tokens each on 2.1. Do not mix in signatures from another model; the thought-signature page has a section on "Thought signatures from other models". If the user switches models, start a new thread.

### 4.3 Masks: not supported in Gemini; Imagen masks are deprecated

- **Verified.** Gemini image editing has no mask parameter. Google's documented technique is **"Inpainting (semantic masking)"**: "Conversationally define a 'mask' to edit a specific part of an image while leaving the rest untouched." Its template is "Using the provided image, change only the [specific element] to [new element/description]. Keep everything else in the image exactly the same, preserving the original style, lighting, and composition." ([ai.google.dev image generation](https://ai.google.dev/gemini-api/docs/image-generation)).
- **Verified.** The SDK still has `models.editImage` with `MaskReferenceConfig`/`maskMode`, which is Imagen (`genai.d.ts:11443-11472,12040-12051`). But Vertex's 2026-03-24 release note lists every Imagen generation endpoint as deprecated, `imagen-3.0-capability-001` and `-002` included, with `gemini-2.5-flash-image` as the migration target, "before June 30, 2026" ([Vertex release notes](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/release-notes)). Vertex's own comparison calls Gemini Image the "Default recommendation" for "mask-free editing" ([Image overview](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/image/overview)).
- **Inference.** **Do not build on Imagen masks.** Get mask-like control in four ways:
  - **framing**: centre the view on the pin;
  - **wording**: the semantic-mask template, plus where it is ("the row of three boilers in the centre-left");
  - **an annotated reference**: a second image, the same view with a translucent outline. Up to 14 images are allowed, so two is fine;
  - **client-side compositing**: alpha-blend the model's output into the original only inside a feathered region around the target. Pixels outside then match the photo exactly. This needs the output to stay registered with the input. Ask for the same aspect ratio as the input view, and check alignment, for example by the mean absolute difference outside the region. If it has shifted, fall back to showing the raw output.

---

## 5. Panorama editing: crops versus whole panorama

| Approach                                                                   | For                                                                                                                                                                                                                                       | Against                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Perspective view at the pin (recommended)**                           | Straight lines stay straight, which models handle well. The machine is centred. The repo already has the projection math (`panorama-views.ts`). The input is small: a 1376×768 JPEG is about 0.3 MB. A 90° horizontal view of a 4608 px panorama has about 1,150 source pixels across, which matches 1K output (**Inference**). | Shows only one view per change. A change spanning a wide arc (a buffer between two distant machines) needs a wider FOV (100 to 110°), which distorts the edges. The edits do not appear in the 3D world or the 360° panorama.                                                                                                                                                                   |
| **B. Whole equirectangular panorama**                                      | One image shows every change, and it could feed the panorama viewer.                                                                                                                                                                      | No 2:1 output (§3.2). The model does not know the image is equirectangular, so added objects get straight edges where curves belong (**Inference**). The left and right edges must meet at the seam, and nothing tells the model so. Poles are stretched. The file is 13.9 MB, over the 7 MB inline limit (§3.3). One bad edit spoils the whole image, and iterating is costly.                                                                                                                                      |
| **C. Perspective edit, then reproject into the panorama**                  | Combines A's quality with a 360° result. The inverse mapping is the same math as `splitPanorama`, run backwards: for each panorama pixel inside the view frustum, sample the edited view.                                                 | Seams where model lighting or colour differs. Needs feathering and colour matching. The panorama is not wired to any 360° image viewer today; only the splat world and a CSS pan effect exist (`capture.tsx:180-215`). It still does not change the 3D splat world.                                                                                                                                                       |
| **D. Screenshot of the splat viewer at the pin**                           | Matches what the user saw in 3D. It can frame buffers, which have no pin, from above.                                                                                                                                                     | The reconstruction is softer than the photo, with floaters. It needs `preserveDrawingBuffer` or a same-frame read (§2.5). The view comes from the ceiling rail, not the photo's viewpoint, so it does not line up with the panorama.                                                                                                                                                                                                                         |

**Recommendation.** Use **A** now, keep **C** as a stretch, and use **D** only for context, such as "fly to" in the viewer next to the image.

How to frame a view for each diff (**Inference**, building on `pinNotes` at `results.tsx:102-127`):

| Diff                                   | Target                                                                       | Framing                                                                                                                                                                                       | Prompt gist                                                                                                                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `add-units` (station)                  | The machine's pins (`count` units)                                           | Yaw and pitch toward the pins' centroid. Widen the FOV until every pin's direction is inside with about 15% margin.                                                                           | "Add one more [name], identical to the existing ones, beside them on the same floor, connected the same way."                                                                                    |
| `add-spare` (support)                  | The support's pins                                                           | Same as above.                                                                                                                                                                                | "Add a standby [name] (e.g. a second valve train / control cabinet) next to the existing one."                                                                                                   |
| `insert-buffer` (`from` → `to`)        | No pin. Use the midpoint of the `from` and `to` centroids, or `to` alone.    | Frame both machines when they are within about 110°. Otherwise frame `to` and place the buffer "just before it".                                                                              | "Add a [buffer kind: tank / rack / conveyor accumulation] of about [capacity] parts between X and Y." Use process context for the kind: a buffer tank in a boiler room, a rack for batches.      |
| `resize-buffer`                        | The machine it feeds, the same rule `pinNotes` uses                          | Frame that machine.                                                                                                                                                                           | "Make the [buffer] before X about twice as large." The result is often weak, because the buffer may not be visible at all.                                                                       |
| `set-param` (mttr, mtbf, …)            | The node's pins                                                              | Frame it.                                                                                                                                                                                     | No physical object. Offer an optional "illustrate", such as a spares cabinet or tool board at the station for halved MTTR. Off by default.                                                        |
| `extraCrews`                           | None                                                                         | None                                                                                                                                                                                          | Do not illustrate; list it in the report only. People generation brings its own safety settings.                                                                                                 |

A view also needs a pin to exist. A change whose machine has no pins gets "no photo for this change" with a link back to the twin step.

---

## 6. Payloads, storage, CORS

### 6.1 Through the API

- **Verified.** Cloud Run allows a maximum HTTP/1 request of **32 MiB** and response of 32 MiB, unless the response is chunked or streamed ([Cloud Run quotas](https://docs.cloud.google.com/run/quotas)). Hono and `@hono/node-server` impose no limit unless `bodyLimit` is added (§2.6).
- **Inference.** Base64 adds 33%. Per turn, a 0.3 MB original plus a 1.5 MB previous JPEG plus an optional 0.3 MB annotated copy comes to about 2.8 MB of base64 JSON. The response, one 2K JPEG as base64, is about 2 to 3 MB. Both are far below the limits. Add `bodyLimit({ maxSize: 20 * 1024 * 1024 })` on the new route only, since the API is public.
- **Decision: where to cut the view (Inference).** The existing routes have the API fetch `panoramaUrl` from the frontend's origin (`twin.ts:82-88`). That fails when the API runs on Cloud Run and the frontend on `localhost`, and it would also fail for user-uploaded panoramas that live only in the browser. Two options:
  - **Browser** (recommended): decode `pano.png` once into a canvas, render the view with the same math as `panorama-views.ts`, and POST a JPEG. Move the pure functions `viewDirection` and `panoramaPoint` into a shared, DOM-free module first.
  - **Server**: send `{ panoramaUrl, yaw, pitch, fov }` and reuse `pngjs`/`jpeg-js`. Simple, but it inherits the reachability problem and spends server CPU decoding a 13.9 MB PNG on every turn.

### 6.2 Storing results in the browser

- **Verified.** "Browsers can store up to 5 MiB of local storage … per origin. Once this limit is reached, browsers throw a `QuotaExceededError`" ([MDN storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)). IndexedDB quotas are per browser: Chromium up to 60% of disk, Firefox best-effort up to 10% or 10 GiB, Safari around 60%. `navigator.storage.persist()` asks for persistence, and `navigator.storage.estimate()` reports usage (same page).
- **Verified.** The repo's localStorage writes swallow quota errors silently (`storage.ts:12-18`, `project.ts:291-295`). An image written to localStorage would vanish without warning, and a large one could crowd out the twin itself.
- **Inference: recommended layout.**
  - **localStorage** key `twin-applied`, a small `AppliedRedesign` JSON (§7.2), and `twin-outcome-chat`, the text turns and an image id per turn.
  - **IndexedDB** database `ada-twin`, store `images`, keyed `[projectId, imageId]`, holding `{ blob, mimeType, width, height, viewSpec, createdAt, model, thoughtSignature? }`. Signatures are opaque base64 strings; they could also sit in the JSON.
  - No dependency is needed: raw IndexedDB or a 1 KB helper. `idb`, `idb-keyval` and `dexie` are not present (`apps/frontend/package.json`).
  - Extend `deleteProject` (`projects.ts:104-119`) to delete that project's IndexedDB records.
  - Keep about the last 10 versions per change view, and call `navigator.storage.persist()` the first time an image is saved.

### 6.3 CORS

**Verified.** CORS is app-wide from `WEB_ORIGIN` (`apps/api/src/index.ts:13-16`), so a new route under `/twin` or `/outcome` inherits it. No change is needed. A JSON POST with `Content-Type: application/json` triggers a preflight, which `hono/cors` answers.

---

## 7. Ranking the applied changes by criticality

### 7.1 Method (Inference, using existing functions)

Let `S` be the applied set, `run` the stored run, and `m(X)` = `measure(run, X)` (`recommend.ts:44-63`).

1. **Solo gain**: `m({i}).completed − baseline.completed`. This is already computed as `alone`.
2. **Marginal gain in the set** (leave-one-out): `m(S).completed − m(S∖{i}).completed`. This captures interactions. A buffer may be worth nothing alone but everything once the bottleneck has a second unit, or the reverse when two changes fix the same constraint. The cost is |S|+1 simulations; `measure` takes seconds on standard rules (`recommend.ts:37-43`).
3. **Target criticality** per `scenario.targets`, for each change:
   - **Required**: the full set `S` meets a target and `S∖{i}` does not.
   - **Helps**: it moves a target metric toward its goal.
   - **No effect on targets.**

   The metrics are `completed ≥ throughputPerShift`, `averageWip ≤ maxAverageWip`, and max station `down ≤ maxDownShare` (`scenario.ts:24-28`, the same metrics as `goal()` at `run.ts:89-101`).
4. **Bottleneck relevance** as a tie-break: the change targets `baseline.bottleneck` or the station with the most `blocked`/`down`/`stopped` time (`kpi.ts:12-28`), using the same logic as `proposeChanges` (`recommend.ts:66-147`). Show the station's time breakdown before and after.
5. **Cost per part** as a secondary sort and display: `perPart(cost, marginal)` (`format.ts:25-29`), where a `twin-costs` estimate exists for the currency.
6. **Robustness.** The steps above use one seed. Run steps 2 and 3 with `simulateDays` (for example 5 days) and `averageKpis`, and show a min–max spread (`days.ts:6-27,86-100`). If the order of two changes flips between days, say so.

Ordering: tier (Required > Helps > None), then marginal gain (descending), then solo gain, then bottleneck relevance, then cost per part (ascending). **Inference.** Leave-one-out marginals do not sum to the total when changes interact. Show "together: +N" as its own number and do not claim the marginals add up to it.

### 7.2 The snapshot to persist at Apply

**Inference.** Write this in `applyRedesign` *before* the `setKept([])` and `setHistory([])` calls at `results.tsx:588-589`:

```ts
interface AppliedRedesign {
  at: number;
  changes: Change[];              // `kept`, verbatim (recommend.ts:19-29)
  run: Pick<StoredRun, "seed" | "tickMinutes" | "scenario" | "graph" | "baseline">; // graph = the pre-change twin
  combined: Kpis | null;          // `redesign` KPIs already on the page
  alone: Record<string, number | "failed">; // results.tsx `alone`
  costs: Record<string, CostEstimate>;     // the matching `twin-costs` entries, currency included
  currency: string;
  machines: Pick<SavedMachine, "id" | "name" | "pins" | "count" | "auxiliary">[]; // before Apply, for framing
  flowLinks: Flow["links"];       // before Apply, to place buffers
}
```

The marginal, target-tier and multi-day numbers can be computed on the new page from `run` and `changes`, so they need not be stored. Without events, a `StoredRun` subset is a few KB, against the hundreds of KB a full run with `events` can take. Keep one snapshot per project, or the last few if the user may apply more than once.

---

## 8. Proposed architecture

```
results.tsx  applyRedesign()
  ├─ write twin-applied (AppliedRedesign)     ← new, before clearing kept/history
  ├─ existing: applyToTwin, setKept([]), setHistory([])
  └─ navigate(/p/:id/outcome)

/p/:id/outcome  (new page, lazy)
  ├─ Report: rank(changes) via measure / simulateDays (client, @repo/sim)
  │    tier · marginal · solo · bottleneck time breakdown · cost/part
  ├─ Photos: for each change with a physical meaning
  │    viewSpec = frame(pins | buffer midpoint)  → crop pano.png in a canvas → JPEG
  │    POST /twin/visualize {view, annotated?, change, plantContext} → {image, text, signature}
  │    store image blobs in IndexedDB; show before/after (+ optional masked composite)
  └─ Chat (per image): POST /twin/visualize/revise {original, last model Content, notes[], message}

apps/api  (new route, same CORS, bodyLimit 20 MB)
  └─ @repo/agent: createImageEditor({ model = process.env.IMAGE_MODEL ?? "gemini-nano-banana-2.1" })
       GoogleGenAI({ vertexai: true, ...vertexSettings() }) — location must resolve to "global"
       generateContent({ responseModalities: [TEXT, IMAGE], imageConfig: { aspectRatio, imageSize, outputMimeType } })
       returns first inlineData part + text + the model Content (with thoughtSignature) | a typed "no image" error
```

- Add `IMAGE_MODEL` to `apps/api/.env.example`, by key name only. Note that Nano Banana 2.1 and Pro are `global` only. A regional `GOOGLE_CLOUD_LOCATION` would break them, though 3.1 Flash Image also serves `us` and `eu`.
- Tests can follow `tests/agent/*.test.ts`. Inject a fake editor the way `AskModel` is injected (`model.ts:61-64`).

---

## 9. Safety, accuracy and labelling

- **Inference.** An edited photo is *illustrative*. The model invents geometry, piping, clearances and scale. It knows nothing of codes, access aisles, foundations or utilities. Label every edited image "AI illustration, not to scale, not an engineering drawing". Always show the original beside it. Never feed an edited image back into the twin: not to locate machines, not into `/twin/flow`, not into World Labs generation.
- **Verified.** SynthID and C2PA are present (§3.4). Tell the user, so that an exported image is recognisable as AI-generated.
- **Inference.** Tie each image to the change and the snapshot it illustrates, and show its prompt. If the twin changes again, mark old images as stale.
- **Verified.** The model may return text and no image, or stop early (§3.4). The UI needs an explicit "no image returned: [model text]" state and a retry.
- **Inference.** Cost guardrail: one image per change on 2.1 at 2K costs about $0.05. A 10-turn chat on Pro costs about $1.34 in output alone. The API is public (`deploy/README.md:103`). Cap turns per image, for example at 10, and images per request at 1.

---

## 10. Open design decisions (with recommended answers)

| #   | Decision                                                                       | Recommended answer                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Which photos: the shared `pano.png` only, or per-project uploads?             | Ship with `WORLD_DIR/pano.png`, since it is all that exists. Persisting Capture uploads in IndexedDB per project is a separate task, and the page should take its panorama as a parameter so that task can plug in.                                                                                     |
| D2  | Step slug and label                                                            | `outcome`, "Outcome", blurb "What the redesign changes, ranked, and how it could look". Alternatives: `plan`, `handover`.                                                                                                                                                              |
| D3  | Navigate automatically after Apply, or offer a button?                         | Navigate automatically. The user asked for it, and Apply is already a commit. Add a "Back to results" link.                                                                                                                                                                         |
| D4  | Ranking basis                                                                  | Target tier, then leave-one-out marginal gain over 5 simulated days, then solo gain, then cost per part (§7.1).                                                                                                                                                                       |
| D5  | Default image model                                                            | `gemini-nano-banana-2.1` at 2K, with `IMAGE_MODEL=gemini-3-pro-image` as the quality option. Avoid 2.5 Flash Image (retires 2027-03-15, 3 input images) and Flash-Lite for the chat (not tuned for multi-turn).                                                                   |
| D6  | Perspective crops or the whole panorama                                        | Crops (approach A). Reprojecting into the panorama (C) is a later phase.                                                                                                                                                                                                              |
| D7  | Where to cut the crop                                                          | In the browser (canvas), with the projection math moved into a DOM-free shared module.                                                                                                                                                                                                |
| D8  | Enforce "only this area changed"?                                              | Start prompt-only: centre the view and use the semantic-mask template. Add the annotated second image if results wander. Treat client-side composite blending as an opt-in toggle.                                                                                                     |
| D9  | One chat per image, or one chat for all images?                                | One thread per change view, with the image under discussion explicit in the UI. A single chat may name which image a message is for, but each request edits one image.                                                                                                               |
| D10 | Where images and chat history live                                             | IndexedDB for blobs and signatures, localStorage for the small snapshot and chat text. No server storage until projects move server side.                                                                                                                                             |
| D11 | Illustrate non-physical changes (MTTR, crews)?                                 | Not by default. Offer an "illustrate" button for `set-param` only; never illustrate crews.                                                                                                                                                                                             |
| D12 | Output format and size                                                         | JPEG through `outputMimeType` (Vertex only), 16:9, 2K. Use 1K for chat iterations if cost or latency matters.                                                                                                                                                                         |
| D13 | Abuse and cost limits on the public API                                        | `bodyLimit` of 20 MB on the route, a cap of 10 turns per thread, and one image per request. Consider Flex/Batch pricing for the first pass over all changes; Nano Banana 2.1 has no Flex, Pro does.                                                                                    |

---

## Sources

**Google (read 2026-10-17)**

- Vertex / Agent Platform model specs:
  - [Nano Banana 2.1](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/nano-banana-2-1)
  - [3.1 Flash Image](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-image)
  - [3.1 Flash-Lite Image](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-lite-image)
  - [3 Pro Image](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-pro-image)
  - [2.5 Flash Image](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/2-5-flash-image)
- [Edit images with Gemini](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/gemini-edit-images)
- [Generate images with Gemini](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/image-generation)
- [Limitations](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/gemini-image-generation-limitations)
- [Best practices](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/gemini-image-generation-best-practices)
- [Responsible AI](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/gemini-image-responsible-ai)
- [Thought signatures](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking/thought-signatures)
- [Vertex pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing)
- [Vertex release notes](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/release-notes) (Imagen deprecation, 2026-03-24)
- [Image overview](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/image/overview)
- Gemini Developer API:
  - [Image generation](https://ai.google.dev/gemini-api/docs/image-generation)
  - [Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Cloud Run quotas](https://docs.cloud.google.com/run/quotas)

**Other**

- [MDN: Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- Installed SDK typings: `packages/agent/node_modules/@google/genai/dist/genai.d.ts` (v2.28.0)

**Repo** (paths cited inline)

- `apps/frontend/src/{lib/projects.ts, main.tsx, lib/storage.ts, twin/project.ts, twin/recommend.ts, pages/steps/results.tsx, pages/steps/capture.tsx, pages/steps/twin.tsx, results/format.ts, components/viewer/*}`
- `apps/api/src/{index.ts, routes/twin.ts, routes/run.ts}`
- `packages/agent/src/{model.ts, panorama-views.ts, agents/cost-estimator.ts}`
- `packages/sim/src/{kpi.ts, scenario.ts, days.ts, diff.ts}`
- `scripts/src/fetch-world.ts`
- `deploy/{deploy.mjs, README.md}`
