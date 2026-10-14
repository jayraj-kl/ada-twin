# Scripts

One-off command-line tools. Run them from the repo root after `pnpm install`:

```sh
pnpm --filter @repo/scripts <script> [args]
```

Paths in arguments are relative to this `scripts/` folder.

## Setup

- **World Labs scripts** (`generate-pano`, `fetch-world`, `medsim-demo`): copy
  `.env.example` to `.env` and set `WORLD_LABS_API_KEY`.
- **`agent-demo`**: set `GEMINI_API_KEY` in `apps/api/.env`.

## Scripts

### `generate-pano` — make a world from a 360° panorama

```sh
pnpm --filter @repo/scripts generate-pano inputs/boiler_room.jpg --name "Boiler room"
```

Needs an equirectangular image (2:1, ideally 2560x1280). Optional: `--model`
(default `marble-1.1-plus`), `--name`, `--prompt`. Uses World Labs credits and
can take over ten minutes. Prints the finished world, including its id.

### `fetch-world` — download a world for the web viewer

```sh
pnpm --filter @repo/scripts fetch-world <worldId>
```

Saves the splat, collider mesh, panorama and `world.json` to
`apps/web/public/worlds/demo` (change with `--out <dir>`). Costs no credits.

### `agent-demo` — run the demo factory with and without agents

```sh
pnpm --filter @repo/scripts agent-demo --seed 1 --tick 30
```

Simulates one shift twice on the same seed, a no-agent baseline and one run by
Gemini agents, and prints the results of both. `--tick` is the minutes between
agent check-ins.
