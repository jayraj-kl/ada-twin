# Landing-page variants prompt (impeccable)

A reusable brief for generating five art-directed landing-page explorations with the `impeccable` skill. Swap the **Product brief** block for another product; everything below it is the method.

---

## Product brief (swap this block per product)

- **Product:** AdaTwin. Tagline available as a default headline: "Redesign before you rebuild."
- **What it does (the mechanism):** turns 360° photos of a factory floor into a walkable 3D twin (World Labs Marble), puts a crew of Gemini agents on it (a planner, technicians, a supervisor) to run a simulated shift, compares them with standard rules over many simulated days, tests picked changes on a copy of the twin, and ranks the applied changes by how much more the plant ships. The simulation is deterministic for a given seed, so every change is measured against the same days.
- **Reader and scene:** a plant manager, operations lead or industrial engineer at a mid-size manufacturer, weighing whether to move machines, add a shift or buy equipment.
- **The 3-second thought:** "these people know how a factory floor actually runs."
- **Tone:** calm, engineered, closer to a commissioning report than a pitch. Serious, crafted intelligence. No AI hype, no exclamation marks.
- **Primary action:** "Start your first twin" → `https://ada-twin.web.app/welcome`. It appears in the hero and again at the end of the page.
- **Secondary action:** "Watch the 60-second pitch" → `https://ada-twin.web.app/media/adatwin-pitch.mp4` (check it resolves with curl; if not, fall back to `https://ada-twin.web.app`).
- **Proof on hand (the only claims allowed):** the six steps (Capture, Twin, Scenario, Agents, Results, New plant), World Labs Marble, Gemini on Vertex AI, deterministic seeded simulation, agents compared with standard rules over many simulated days, changes tested on a copy before they are applied, five sample plants (boiler room, foundry, machine shop, pump hall, electrical lab) that need no upload. Source of truth: `README.md`, `GLOSSARY.md`, and the sample-plant data in the repo (find it; use its real machine names and IDs). No customer logos, testimonials, prices, percentages or benchmarks that are not in those files. Any illustrative number is labeled "sample run".
- **Page order (all five versions):** 1. Hero (headline, one line on the mechanism, both actions). 2. The six-step walk, Capture → New plant, shown in a way native to each direction and never as an icon grid. 3. What a run shows: agents against standard rules, ranked changes. 4. Proof: the sample plants and how the measurement works (seeded, deterministic). 5. Closing action.

---

## The prompt

```
/impeccable

SURFACE & MODE
Five standalone landing-page explorations for AdaTwin (see the Product brief in
docs/prompts/landing-variants.md). This is a Persuade surface. Each version lives at
landing-lab/v1/index.html … landing-lab/v5/index.html with its own CSS: static HTML/CSS,
no framework, no build step, vanilla JS only where a canvas or motion needs it.
Treat each vN/index.html as its own surface target with its own surface brief and
direction contract. This is an exploration round; one version will be picked later.

ANSWERS TO YOUR CHECKPOINTS (this run is unattended; do not stop to ask)
- init: write PRODUCT.md from the Product brief. Stack: static HTML/CSS. Build path:
  code-led (no image generation in this harness).
- new-work §2 (who must act / what they should believe / which proof): answered by the
  Product brief.
- Directions are brief-pinned below. Run concept-seed per surface as the contract
  requires, but the pinned direction beats the roll on every dimension it names. Do not
  serve the decision page; record the assigned seed and proceed with the pinned direction.
- DESIGN.md is deferred: write it only for the version that is picked later. I waive the
  FINISH documentation clause for this exploration round.
- Do not touch apps/, do not commit, do not deploy.

PINNED ACROSS ALL FIVE (brand commitments; the brief wins over pattern warnings)
- One monumental image anchors each page (the hero slot, see HERO SLOTS).
- Imagery is processed, never raw: halftone, dither, grain, ASCII, linework. Produce it as
  raster assets or canvas/WebGL, never feTurbulence grain, CSS stripes or SVG imitating a
  picture. In this round only the hero slot is reserved; any secondary processed texture
  must be canvas-generated from geometry (the floor plan, flow lines, voxels), not faked.
- Type at extremes: monumental display (pinned up to ~9–12rem via clamp(), above your 6rem
  floor; suppress the oversized-headline finding with a reason) or tiny mono for data,
  with little in between. Tracking no tighter than -0.04em. Body copy stays legible
  (≥1rem, 65–75ch).
- Mono carries real data only: machine IDs, seeds, run IDs, coordinates on the floor plan,
  ruler ticks, timestamps of a sample shift. Never as a kicker/eyebrow above a heading,
  never as 01/02/03 section numbers. Mono labels ≥11px with ≥4.5:1 contrast.
- Technical marginalia (coordinates, IDs, ruler ticks, timestamps) annotate content in
  the margins, drawn from the real sample plants, labeled "sample run" where illustrative.
- Color strategy: Restrained. Near-monochrome ground plus exactly one warm accent per
  version. The accent owns the primary action and one signature region, not scattered dots.
  No glows.
- Fonts: a different display / body / mono pairing per version. Nothing on the new-work
  blacklist (no Inter, Space Grotesk, Space Mono, IBM Plex, DM Sans/Serif, Fraunces,
  Playfair, Cormorant, Lora, Newsreader, Syne, Outfit, Plus Jakarta, Instrument Sans) and
  never system-font-only. Source from Google Fonts or Fontshare; self-host the woff2 files
  in vN/fonts/ with @font-face.
- Never: purple gradients, glossy 3D blobs, untextured stock photos, rounded-everything
  friendliness, icon-grid feature rows, same-size icon+heading+text cards, the hero-metric
  template, gradient text, glass, badges or chips above the headline, fake logo rows,
  playful iconography, evenly distributed colorful palettes.
- Rounded corners: allowed ONLY on the hero panel/frame and the CTA pills in v1 and v5.
  Chips, cards and data callouts stay square everywhere.
- Copy: plain sentences, no em-dash habit, no "not X, it's Y" reveals, no hype words.
  Headlines are free per version; "Redesign before you rebuild." is the default.

HERO SLOTS (images come later; do not generate or source any imagery)
For each version, create landing-lab/vN/images/hero.png: a flat fill in that direction's
palette at the target pixel size (generate it with a small script). Reference it with an
<img> carrying width, height and alt (or as the background in v2/v3), exactly at the
placement below. Size the type and negative space as if the real image were already there,
so the real file drops in by overwriting hero.png with zero layout change. Write
landing-lab/vN/IMAGES.md listing the slot: filename, aspect ratio, pixel size, position,
and the future subject. Suppress any placeholder-image detector finding with a reason.

THE FIVE DIRECTIONS (commit fully to each; do not blend; each differs in first-viewport
topology, not just palette)

v1 — Print-Tech Paper, through Caldera
  World: a print-shop proof of a plant survey. Grey paper ground (warm grey, not cream),
  a very heavy black grotesque headline, signal red-orange as the single accent.
  Signature move (from the Caldera reference, Daniel Sun on Dribbble): the hero image
  sits in a notched L-shaped panel that wraps the headline from the right and below, with
  rounded inner corners; a short line of copy and both actions sit in a cut-out pocket in
  the panel's lower right. Orange pill primary, dashed-outline pill secondary.
  Mono data-callout chips (square) and film-strip ruler ticks around the panel.
  Future hero: a factory floor plan drawn as contour linework, machines as nodes and
  material flow as isolines, halftoned in black ink on grey paper with orange hot spots
  where the bottlenecks are.

v2 — Data-as-Texture
  World: cinematic data as material. Full-bleed dark teal sky, amber/golden accent on the
  actions, mono labels as instrument readouts.
  Placement: full-bleed; headline left on the darkest area; the image mass fills the lower
  right.
  Future hero: steam rising off a boiler house at golden hour, built from amber binary
  digits against a dark teal sky.

v3 — Vast Quiet Cinematic
  World: editorial minimalism at landscape scale. Extreme whitespace, tiny centered sans,
  a quiet action.
  Placement: full-bleed; the fog-white upper half is the headline zone with tiny centered
  type; the plant fills the lower half.
  Future hero: a vast desaturated aerial view of an industrial plant at dawn, the upper
  half pure fog-white.

v4 — Dither Mono, through Card Banking
  World: brutalist-editorial black and white, stark studio dark, clean sans body, high
  contrast. The only accent is hazard yellow on the action.
  Signature move (from the Card Banking reference, QClay on Dribbble; the shot is saved at
  original-9cfc0f25a37d68687c7c9283804b8f5b.webp in the repo root, read it, match feel
  not content): a physical object breaking into pixel voxels, which here means the
  plant becoming its digital twin. Echo it in a canvas voxel scatter at the hero edge and
  in a footer whose top edge steps down in pixels. Ignore that shot's icon cards, logo
  row, lime/purple palette and Title Case headlines.
  Placement: the image fills the right half against black; the left half stays near-black
  as the headline column; a giant cropped ADATWIN wordmark overlaps the bottom edge.
  Future hero: a dithered industrial press emerging from black, lit from the right, its
  left side breaking into pixel voxels that drift into the dark.

v5 — Classical Remix, through Medical
  World: a classical engraving on a drenched blue ground. The drenched blue (one hue, light
  to deep) is the near-monochrome ground; pale yellow is the single warm accent. A serif
  italic carries one emphasized word in the headline.
  Signature move (from the Medical reference, Tino on Dribbble): a rounded drenched-blue
  panel inset in a white frame, with thin white orbit lines sweeping across it and behind
  the left text column; white pill primary action. Ignore that shot's eyebrow chip,
  playful icons and friendly geometric display face.
  Placement: the figure sits on the right half of the panel; orbit lines continue behind
  the left text column; a row of the five sample plants runs below (no fake logos).
  Future hero: a grainy vintage engraving of an engineer in a work coat studying a floor
  plan, cut out on the blue.

PER-SURFACE CONTRACT
For each vN write the direction contract (THESIS, OWN-WORLD, STORY, FIRST VIEWPORT, FORM
with seed reference, FINISH) into its surface brief before writing code. FIRST VIEWPORT
names the headline scale, where the primary action sits, where the hero slot sits, and
one named signature interaction plus its motion grammar (one authored moment, exponential
ease-out, respects prefers-reduced-motion). Never copy the contract into HTML or comments.
Theme browser surfaces (selection, caret, focus rings, scrollbars) from each palette.
Every page works at 390px wide with no horizontal scroll.

FINISH
Serve landing-lab/ on localhost. For each version capture landing-lab/_review/vN-desktop.png
(1440 wide, full page) and vN-mobile.png (390 wide) after entrance motion settles. Run
`impeccable detect --json` on all five index.html files, fix mechanical findings, and
suppress intentional ones (monumental type, placeholders) with a written reason. Run a fresh
finish reviewer per version and fix within two rounds. Report per version: the direction
it commits to, fonts used, the finish-review disposition word verbatim, suppressed findings
and why, and the screenshot paths.
```
