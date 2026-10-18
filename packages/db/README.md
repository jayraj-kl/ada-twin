# Database

Postgres schema and queries, written with Drizzle. Large files (world assets,
uploaded documents, run event logs) live in Cloud Storage; the tables hold
their paths.

## Setup

Local development uses the Postgres in `compose.yaml`, on port 5434 so it
clears a Postgres installed on the machine (`DB_PORT` moves it):

```sh
docker compose up -d db
```

Copy `.env.example` to `.env`; its `DATABASE_URL` points at that database, and
the API reads the same one from `apps/api/.env`. The deployed API uses Cloud
SQL instead. Then apply the migrations:

```sh
pnpm --filter @repo/db db:migrate
```

## Commands

Run from the repo root:

```sh
pnpm --filter @repo/db db:push      # apply the schema directly (local development)
pnpm --filter @repo/db db:generate  # write migration files to drizzle/
pnpm --filter @repo/db db:migrate   # apply migration files
pnpm --filter @repo/db db:studio    # browse the data
```

## Tables

- `world` — a generated World Labs world and where its assets are stored.
- `project` — one factory twin: machines, flow, scenario, crew, accepted changes,
  how far it got, and whether it is a copy of the sample. Anonymous: knowing
  the id gives access; `owner_id` waits for sign-in.
- `project_state` — page state the server never reads, one value per key.
- `document` — a file uploaded for one machine of a project.
- `run` — one simulated shift, with a copy of what it ran on and its results.

## Layout

- `src/index.ts` — the database client.
- `src/db/schema/` — one file per table.
- `src/db/queries/` — `insert.ts`, `select.ts`, `update.ts`, `delete.ts`.
- `src/db/type.ts` — row and insert types.

## Using it

```ts
import { insertProject } from "@repo/db/queries/insert";
import { selectProjectById } from "@repo/db/queries/select";
import type { ProjectRow } from "@repo/db/type";
```
