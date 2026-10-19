# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Landing explorations (`landing-lab/`): static HTML/CSS, no framework, no build step, vanilla JS only where a canvas or motion needs it (user's answer in docs/prompts/landing-variants.md). The app itself (`apps/frontend`) is React 19, Vite and Tailwind 4 and is out of scope for the landing work.

## Users

A plant manager, operations lead or industrial engineer at a mid-size manufacturer, weighing whether to move machines, add a shift or buy equipment. They know how a floor runs and distrust anything that sounds like a pitch.

## Product Purpose

AdaTwin turns 360° photos of a factory floor into a walkable 3D twin, puts a crew of AI agents on it to run a simulated shift, and tells the user which changes would make the plant ship more, before a single machine is moved. Success: the user tests a change on the twin, sees it measured fairly, and applies only what works.

## Positioning

The mechanism no neighbour can copy: a walkable twin built from the user's own 360° photos (World Labs Marble), a crew of Gemini agents (planner, technicians, supervisor) running the shift on it, compared with standard rules over many simulated days, picked changes tested on a copy of the twin, and applied changes ranked by how much more the plant ships. The simulation is deterministic for a given seed, so every change is measured against the same days.

## Operating Context

A project walks six steps, one page each: Capture, Twin, Scenario, Agents, Results, New plant. Five sample plants (boiler room, foundry, machine shop, pump hall, electrical lab) open without any upload. Product vocabulary is fixed in GLOSSARY.md (twin, crew, standard rules, days, run, change, picks, trial, gain, apply, tested, stale).

## Capabilities and Constraints

- Capture: 360° panoramas become a walkable 3D world (World Labs Marble).
- Twin: machines and material flow; Gemini drafts the flow and finds machines in the photos.
- Scenario: conditions in plain words (heat, demand, supply losses, staff off sick).
- Agents: planner, technicians and supervisor, each with a personality; Gemini on Vertex AI.
- Results: crew compared with standard rules over many simulated days (default 10, up to 60); picks run as a trial on a copy of the twin; only tested picks can be applied.
- New plant: applied changes ranked by how much they matter; Nano Banana redraws them into photos of the plant.
- Simulation (`packages/sim`): discrete-event, deterministic for a given seed.

## Brand Commitments

- Name: AdaTwin. Tagline: "Redesign before you rebuild."
- Voice: calm, engineered, closer to a commissioning report than a pitch. Plain sentences, no AI hype, no exclamation marks, no hype words.
- Primary action: "Start your first twin" → https://ada-twin.web.app/welcome. Secondary: "Watch the 60-second pitch" → https://ada-twin.web.app/media/adatwin-pitch.mp4.
- Landing explorations: binding visual constraints recorded in docs/prompts/landing-variants.md (user-pinned; not expanded here).

## Evidence on Hand

- README.md, GLOSSARY.md: the six steps, the stack, the vocabulary.
- Sample plants, `apps/frontend/src/twin/sample.ts`: Boiler room (feed pumps ×2, boilers ×2, control panel ×1, gas valve trains ×2 auxiliary; counts batches), Foundry (cutting tables ×3, welding bays ×4, grinding station ×1, overhead crane auxiliary; parts), Machine shop (boring mill, milling machines ×2, radial drill, inspection bench, overhead crane auxiliary; castings), Pump hall (main pumps ×2, booster pump, control panel; batches), Electrical lab (rewinding workbenches ×6, motor test stands ×4, instrument panel; motors). Machine IDs follow `<slug>-<n>`.
- Defaults, `apps/frontend/src/twin/project.ts`: scenario "Hot week, full order book" (8-hour shift, 34 °C, demand 340 per shift, target 300); crew Priya (planner, aggressive), Marek (maintenance, by the book), Sam (supervisor, cautious); check-ins every 30 minutes; 10 days by default, up to 60.
- The 60-second pitch video (resolves at the URL above).
- Absent and never to be fabricated: customers, logos, testimonials, prices, percentages, benchmarks. Any illustrative number is labeled "sample run".

## Product Principles

- Measure before you move: every change is tested on a copy before it touches the twin.
- Fair comparison: same seed, same days, standard rules as the yardstick.
- The plant's own words: machine names, units of work and conditions come from the user's floor.
- Show the run, not adjectives.
