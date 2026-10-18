// Builds the frontend against the Cloud Run API and deploys it to Firebase
// Hosting (https://ada-twin.web.app). Setup is in ./README.md.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// The browser calls the API directly: Firebase Hosting would cut a rewritten
// request off after 60 seconds, and a shift streams for longer.
const API_URL =
  process.env.VITE_API_URL ??
  "https://ada-twin-api-578444699555.africa-south1.run.app";
const PROJECT = process.env.GCP_PROJECT ?? "gen-lang-client-0447144465";

// pnpm and firebase are .cmd shims on Windows, which only a shell can launch.
const shell = process.platform === "win32";
const root = fileURLToPath(new URL("..", import.meta.url));
const frontend = fileURLToPath(new URL("../apps/frontend", import.meta.url));

function run(command, args, cwd, env = {}) {
  const { status } = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell,
    env: { ...process.env, ...env },
  });
  if (status !== 0) process.exit(status ?? 1);
}

console.log(`Building the frontend against ${API_URL}`);
run("pnpm", ["--filter", "frontend", "build"], root, { VITE_API_URL: API_URL });
run(
  "firebase",
  ["deploy", "--only", "hosting", `--project=${PROJECT}`],
  frontend,
);
