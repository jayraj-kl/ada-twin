# Database

Postgres schema and queries, written with Drizzle. Large files (world assets,
uploaded documents, run event logs) live in Cloud Storage; the tables hold
their paths.

## Setup

Copy `.env.example` to `.env` and set `DATABASE_URL` to a Postgres database.

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
- `project` — one factory twin: machines, flow, scenario, crew, accepted changes.
- `document` — a file uploaded for one machine of a project.
- `run` — one simulated shift, with a copy of what it ran on and its results.

## Layout

- `src/index.ts` — the database client.
- `src/db/schema/` — one file per table.
- `src/db/queries/` — `insert.ts`, `select.ts`, `update.ts`.
- `src/db/type.ts` — row and insert types.

## Using it

```ts
import { insertProject } from "@repo/db/queries/insert";
import { selectProjectById } from "@repo/db/queries/select";
import type { ProjectRow } from "@repo/db/type";
```
