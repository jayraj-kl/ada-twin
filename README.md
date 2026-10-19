# AdaTwin

**Redesign before you rebuild.** AdaTwin turns 360° photos of a factory floor into a digital twin, puts a crew of AI agents on it to run a simulated shift, and tells you which changes would make the plant ship more, before you move a single machine.

<video src="assets/adatwin-pitch.mp4" controls width="100%"></video>

**Watch the 60-second pitch:** [assets/adatwin-pitch.mp4](assets/adatwin-pitch.mp4)

**Try it:** [ada-twin.web.app](https://ada-twin.web.app). Open a sample plant (boiler room, foundry, machine shop, pump hall or electrical lab) to explore without uploading anything.

## How it works

A project walks through six steps, one page each:

| Step          | What you do                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Capture**   | Upload 360° panoramas of your floor. World Labs Marble turns them into a walkable 3D world.                                                                                                             |
| **Twin**      | List your machines and draw how material flows between them. Gemini drafts the flow from your description and finds the machines in your photos.                                                        |
| **Scenario**  | Set the conditions to test against, in plain words: a heatwave, a rush order, half the maintenance team off sick.                                                                                       |
| **Agents**    | Put a crew on the floor: a planner, technicians and a supervisor, each with a personality.                                                                                                              |
| **Results**   | Run the shift and watch the agents decide in the 3D world. Compare them with standard rules over many simulated days, then pick changes, run them on a copy of your twin, and apply the ones that work. |
| **New plant** | See the applied changes ranked by how much they matter, with Nano Banana drawing them into photos of your plant.                                                                                        |

The words used here (twin, run, trial, picks, stale) are defined in [GLOSSARY.md](GLOSSARY.md).

## Architecture

![AdaTwin architecture](docs/architecture/images/ada-twin-architecture-lean.png)

- **Frontend** (`apps/frontend`): React 19, Vite and Tailwind 4, with the 3D world rendered as Gaussian splats. Quick measurements run in the browser on the same simulation as the API. Hosted on Firebase Hosting.
- **API** (`apps/api`): Hono on Cloud Run. It streams each shift to the page as it happens, runs the Gemini agents on Vertex AI, and keeps projects in Postgres (Cloud SQL) and their files in Cloud Storage.
- **Simulation** (`packages/sim`): a discrete-event model of the floor: machines, buffers, breakdowns, repairs, crews and scenario effects. It is deterministic for a given seed, so a change is always measured against the same days.

The full diagram is in [`docs/architecture/images`](docs/architecture/images), with its draw.io sources in [`docs/architecture/drawio`](docs/architecture/drawio).

## Quick start

You need Node 24+, pnpm 11, Docker, and a Google Cloud project with Vertex AI enabled.

```sh
pnpm install

# Local Postgres on port 5434
docker compose up -d db

# Environment: copy each example and fill in the blanks
cp apps/api/.env.example apps/api/.env
cp apps/frontend/.env.example apps/frontend/.env
cp packages/db/.env.example packages/db/.env   # DATABASE_URL=postgres://postgres:postgres@localhost:5434/factory_twin

# Create the tables
pnpm --filter @repo/db db:migrate

# Gemini on Vertex AI and Cloud Storage sign in with your Google account
gcloud auth application-default login

pnpm dev
```

The app runs at http://localhost:3000, with the API at http://localhost:8080.

Keys go in `apps/api/.env`: `GOOGLE_CLOUD_PROJECT` for Gemini, `WORLD_LABS_API_KEY` to build 3D worlds from your own photos, and `GCS_BUCKET` for project files. Local development writes under `GCS_PREFIX=dev/`, so it never touches production files. The samples work without a World Labs key.

## Project structure

```
apps/
  frontend/     the web app, one page per step
  api/          Hono API: shifts, agents, projects, worlds
packages/
  sim/          the factory simulation
  agent/        the Gemini agents: crew, flow drafter, scenario writer, scouts
  db/           Drizzle schema, queries and migrations
  world/        World Labs client
  logger/       structured logging
  ui/           shared React components
scripts/        demos, benchmarks and world fetching
tests/          Vitest tests for the simulation and the agents
deploy/         Cloud Run and Firebase Hosting deploys
docs/           architecture diagrams and research notes
```

## Development

| Command            | What it does                              |
| ------------------ | ----------------------------------------- |
| `pnpm dev`         | Runs the frontend and the API with reload |
| `pnpm test`        | Runs the simulation and agent tests       |
| `pnpm check-types` | Typechecks every workspace                |
| `pnpm lint`        | Lints every workspace                     |
| `pnpm build`       | Builds every workspace                    |

The agent tests use scripted model replies, so they never call Gemini.

## Deploy

```sh
pnpm run deploy       # API: builds on Cloud Build, migrates the database, rolls out to Cloud Run
pnpm run deploy:web   # Frontend: builds against the API and deploys to Firebase Hosting
```

The one-time Google Cloud setup (project, Cloud SQL, bucket, secrets) is in [deploy/README.md](deploy/README.md).

## Built with

Gemini on Vertex AI (agents, flow drafting, scenarios, reports) · Google ADK · World Labs Marble (3D worlds) · Nano Banana (redrawn photos) · React · Vite · Tailwind · Hono · Drizzle · Postgres · Cloud Run · Cloud Storage · Firebase Hosting · Turborepo
